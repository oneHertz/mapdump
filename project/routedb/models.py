import base64
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
from datetime import timezone
from datetime import datetime
from io import BytesIO
import arrow
import gpxpy
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.base import ContentFile, File
from django.db import models
from django.urls import reverse
from django.utils.timezone import now
from django_s3_storage.storage import S3Storage
from PIL import Image
from tagging.registry import register as register_tagged_model
from project.utils.helper import country_at_coords, random_key, time_base64, tz_at_coords
from project.utils.validators import (
    validate_corners_coordinates,
    validate_latitude,
    validate_longitude,
)

map_storage = S3Storage(aws_s3_bucket_name=settings.AWS_S3_BUCKET)


def map_upload_path(instance=None, file_name=None):
    tmp_path = ["maps"]
    time_hash = time_base64()
    basename = f"{instance.uid}_{time_hash}"
    tmp_path.append(basename[0].upper())
    tmp_path.append(basename[1].upper())
    tmp_path.append(basename)
    return os.path.join(*tmp_path)


def avatar_upload_path(instance=None, file_name=None):
    tmp_path = ["avatars"]
    time_hash = time_base64()
    basename = f"{instance.id}_{time_hash}"
    tmp_path.append(basename)
    return os.path.join(*tmp_path)


class UserSettings(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    strava_access_token = models.TextField(blank=True, null=True)
    avatar = models.ImageField(
        upload_to=avatar_upload_path, storage=map_storage, null=True, blank=True
    )
    date_fetched_likes = models.DateTimeField(blank=True, null=True)
    date_fetched_comments = models.DateTimeField(blank=True, null=True)

    @property
    def avatar_data(self):
        if not self.avatar:
            return b""
        with self.avatar.open("rb") as fp:
            data = fp.read()
            return data

    @property
    def avatar_b64(self):
        data = self.avatar_data
        return f"data:image/png;base64,{base64.b64encode(data).decode()}"

    @avatar_b64.setter
    def avatar_b64(self, value):
        if not value:
            self.avatar = None
            return
        content_b64 = value.partition("base64,")[2]
        self.avatar.save(
            "filename",
            ContentFile(base64.b64decode(content_b64)),
            save=False,
        )
        self.avatar.close()

    class Meta:
        verbose_name = "user settings"
        verbose_name_plural = "user settings"


User.settings = property(lambda u: UserSettings.objects.get_or_create(user=u)[0])


class RasterMap(models.Model):
    uid = models.CharField(
        default=random_key,
        max_length=12,
        editable=False,
        unique=True,
    )
    creation_date = models.DateTimeField(auto_now_add=True)
    modification_date = models.DateTimeField(auto_now=True)
    uploader = models.ForeignKey(User, related_name="maps", on_delete=models.CASCADE)
    image = models.ImageField(
        upload_to=map_upload_path,
        height_field="height",
        width_field="width",
        storage=map_storage,
    )
    height = models.PositiveIntegerField(null=True, blank=True, editable=False)
    width = models.PositiveIntegerField(
        null=True,
        blank=True,
        editable=False,
    )
    corners_coordinates = models.CharField(
        max_length=255,
        help_text="Latitude and longitude of map corners separated by commas "
        "in following order Top Left, Top right, Bottom Right, Bottom left. "
        "eg: 60.519,22.078,60.518,22.115,60.491,22.112,60.492,22.073",
        validators=[validate_corners_coordinates],
    )
    mime_type = models.CharField(max_length=256, editable=False, default="image/jpeg")
    country = models.CharField(max_length=2, editable=False)
    _latitude = models.FloatField(validators=[validate_latitude], editable=False)
    _longitude = models.FloatField(validators=[validate_longitude], editable=False)

    def prefetch_map_extras(self, *args, **kwargs):
        self._latitude, self._longitude = self.get_center()
        self.country = self.get_country()

    @property
    def path(self):
        return self.image.name

    @property
    def data(self):
        with self.image.open("rb") as fp:
            data = fp.read()
        return data

    @property
    def data_uri(self):
        return "data:{};base64,{}".format(
            self.mime_type, base64.b64encode(self.data).decode("utf-8")
        )

    @data_uri.setter
    def data_uri(self, value):
        if not value:
            raise ValueError("Value can not be null")
        data_matched = re.match(
            r"^data:image/(?P<format>jpeg|png|gif);base64,"
            r"(?P<data_b64>(?:[A-Za-z0-9+/]{4})*"
            r"(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$",
            value,
        )
        if data_matched:
            self.image.save(
                "filename",
                ContentFile(base64.b64decode(data_matched.group("data_b64"))),
                save=False,
            )
            self.image.close()
        else:
            raise ValueError("Not a base 64 encoded data URI of an image")

    def strip_exif(self):
        if self.image.closed:
            self.image.open()
        with Image.open(self.image.file) as image:
            rgb_img = image.convert("RGB")
            # if image.size[0] > 2000 or image.size[1] > 2000:
            #    rgb_img.thumbnail((2000, 2000), Image.ANTIALIAS)
            out_buffer = BytesIO()
            rgb_img.save(out_buffer, "JPEG", quality=80, dpi=(300, 300))
            f_new = File(out_buffer, name=self.image.name)
            self.image.save(
                "filename",
                f_new,
                save=False,
            )
        self.image.close()

    def rotate(self, ninety_multiplier=1):
        ninety_multiplier = ninety_multiplier % 4
        cc = self.corners_coordinates.split(",")
        self.corners_coordinates = ",".join(
            cc[2 * ninety_multiplier :] + cc[: 2 * ninety_multiplier]
        )
        if self.image.closed:
            self.image.open()
        with Image.open(self.image.file) as image:
            image = image.transpose(ninety_multiplier + 1)
            out_buffer = BytesIO()
            image.save(out_buffer, self.mime_type[6:])
            f_new = File(out_buffer, name=self.image.name)
            self.image.save(
                "filename",
                f_new,
                save=False,
            )
        self.image.close()
        self.save()

    @property
    def hash(self):
        hash = hashlib.sha256()
        hash.update(self.data_uri.encode("utf-8"))
        hash.update(self.corners_coordinates.encode("utf-8"))
        return base64.b64encode(hash.digest()).decode("utf-8")

    @property
    def bounds(self):
        cal_values = [float(x) for x in self.corners_coordinates.split(",")]
        return {
            "top_left": [cal_values[0], cal_values[1]],
            "top_right": [cal_values[2], cal_values[3]],
            "bottom_right": [cal_values[4], cal_values[5]],
            "bottom_left": [cal_values[6], cal_values[7]],
        }

    @bounds.setter
    def bounds(self, value):
        self.corners_coordinates = "{},{},{},{},{},{},{},{}".format(
            value["top_left"][0],
            value["top_left"][1],
            value["top_right"][0],
            value["top_right"][1],
            value["bottom_right"][0],
            value["bottom_right"][1],
            value["bottom_left"][0],
            value["bottom_left"][1],
        )

    @property
    def size(self):
        return {"width": self.width, "height": self.height}

    @property
    def center(self):
        return [self._latitude, self._longitude]

    def get_center(self):
        cal_values = [float(x) for x in self.corners_coordinates.split(",")]
        lats = cal_values[::2]
        lons = cal_values[1::2]
        return [sum(lats) / 4, sum(lons) / 4]

    def get_country(self):
        return country_at_coords(*self.center)

    @property
    def thumbnail(self):
        cache_key = f"map_{self.image.name}_thumb"
        cached_thumb = cache.get(cache_key)
        if cached_thumb:
            return cached_thumb
        orig = self.image.storage.open(self.image.name, "rb").read()
        img = Image.open(BytesIO(orig))
        if img.mode != "RGBA":
            img = img.convert("RGB")
        img = img.transform(
            (256, 256),
            Image.QUAD,
            (
                int(self.width) / 2 - 256,
                int(self.height) / 2 - 256,
                int(self.width) / 2 - 256,
                int(self.height) / 2 + 256,
                int(self.width) / 2 + 256,
                int(self.height) / 2 + 256,
                int(self.width) / 2 + 256,
                int(self.height) / 2 - 256,
            ),
        )
        img_out = Image.new("RGB", img.size, (255, 255, 255, 0))
        img_out.paste(img, (0, 0))
        img.close()
        up_buffer = BytesIO()
        img_out.save(up_buffer, "JPEG", quality=80)
        up_buffer.seek(0)
        data_out = up_buffer.read()
        try:
            cache.set(cache_key, data_out, 31 * 24 * 3600)
        except Exception:
            pass
        return data_out

    @property
    def og_thumbnail(self):
        cache_key = f"map_{self.image.name}_og_thumb"
        cached_thumb = cache.get(cache_key)
        if cached_thumb:
            return cached_thumb
        orig = self.image.storage.open(self.image.name, "rb").read()
        img = Image.open(BytesIO(orig))
        if img.mode != "RGBA":
            img = img.convert("RGB")
        img = img.transform(
            (1200, 630),
            Image.QUAD,
            (
                int(self.width) / 2 - 300,
                int(self.height) / 2 - 158,
                int(self.width) / 2 - 300,
                int(self.height) / 2 + 157,
                int(self.width) / 2 + 300,
                int(self.height) / 2 + 157,
                int(self.width) / 2 + 300,
                int(self.height) / 2 - 158,
            ),
        )
        img_out = Image.new("RGB", img.size, (255, 255, 255, 0))
        img_out.paste(img, (0, 0))
        img.close()
        up_buffer = BytesIO()
        img_out.save(up_buffer, "JPEG", quality=80)
        up_buffer.seek(0)
        data_out = up_buffer.read()
        try:
            cache.set(cache_key, data_out, 31 * 24 * 3600)
        except Exception:
            pass
        return data_out

    @property
    def image_url(self):
        return reverse("raster_map_image", kwargs={"uid": self.uid})

    @property
    def location_image_url(self):
        return reverse("raster_map_location_image", kwargs={"uid": self.uid})

    def __str__(self):
        return "map <{}>".format(self.uid)

    class Meta:
        ordering = ["-creation_date"]
        verbose_name = "raster map"
        verbose_name_plural = "raster maps"


class Route(models.Model):
    uid = models.CharField(
        default=random_key,
        max_length=12,
        editable=False,
        unique=True,
    )
    creation_date = models.DateTimeField(auto_now_add=True)
    modification_date = models.DateTimeField(auto_now=True)
    is_private = models.BooleanField(default=False)
    athlete = models.ForeignKey(User, related_name="routes", on_delete=models.CASCADE)
    name = models.CharField(max_length=52)
    route_json = models.TextField()
    raster_map = models.ForeignKey(
        RasterMap, blank=True, null=True, on_delete=models.SET_NULL
    )
    start_time = models.DateTimeField(editable=False)
    country = models.CharField(max_length=2)
    tz = models.CharField(max_length=32)
    distance = models.IntegerField()
    duration = models.IntegerField(blank=True, null=True)
    comment = models.TextField(blank=True)

    def prefetch_route_extras(self, *args, **kwargs):
        if self.route[0]["time"]:
            self.start_time = datetime.fromtimestamp(self.route[0]["time"], timezone.utc)
            self.duration = self.get_duration()
        elif self.start_time is None:
            self.start_time = now()
        self.country = self.get_country()
        self.tz = self.get_tz() or "UTC"
        self.distance = self.get_distance()

    @property
    def route(self):
        return json.loads(self.route_json)

    @route.setter
    def route(self, value):
        self.route_json = json.dumps(value)

    def route_image(self, header=True, route=True):
        arg = "_h" if header else ""
        arg += "_r" if route else ""
        cache_key = f"route_{self.images_path}{arg}"
        cached = cache.get(cache_key)
        if cached:
            return cached
        orig = self.raster_map.data
        data_uri = ""
        with (
            tempfile.NamedTemporaryFile() as img_file,
            tempfile.NamedTemporaryFile() as route_file,
        ):
            img_file.write(orig)
            img_file.flush()
            route_file.write(self.route_json.encode("utf-8"))
            route_file.flush()
            data_uri = subprocess.check_output(
                [
                    settings.NODEJS_PATH,
                    "generate_map.js",
                    img_file.name,
                    route_file.name,
                    json.dumps(self.raster_map.bounds),
                    arg,
                    self.tz,
                ],
                stderr=subprocess.STDOUT,
                cwd=os.path.join(settings.BASE_DIR, "jstools"),
                env=dict(os.environ, NODE_OPTIONS="--openssl-legacy-provider"),
            )

        if data_uri:
            header, encoded = data_uri.decode("utf-8").split(",", 1)
            if not header.startswith("data"):
                return None
            data = base64.b64decode(encoded)
            try:
                cache.set(cache_key, data, 31 * 24 * 3600)
            except Exception:
                pass
            return data
        return None

    @property
    def api_url(self):
        return reverse("route_detail", kwargs={"uid": self.uid})

    def get_tz(self):
        return tz_at_coords(
            self.route[0]["latlon"][0],
            self.route[0]["latlon"][1],
        )

    def get_country(self):
        return country_at_coords(
            self.route[0]["latlon"][0],
            self.route[0]["latlon"][1],
        )

    def get_duration(self):
        return self.route[-1]["time"] - self.route[0]["time"]

    def get_distance(self):
        d = 0
        prev_p = self.route[0]
        c = math.pi / 180
        for p in self.route[1:]:
            dlat = p["latlon"][0] - prev_p["latlon"][0]
            dlon = p["latlon"][1] - prev_p["latlon"][1]
            a = (
                math.sin(c * dlat / 2) ** 2
                + math.cos(c * p["latlon"][0])
                * math.cos(c * prev_p["latlon"][0])
                * math.sin(c * dlon / 2) ** 2
            )
            d += 12756274 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            prev_p = p
        return d

    @property
    def athlete_fullname(self):
        fullname = "{} {}".format(self.athlete.first_name, self.athlete.last_name)
        if not fullname:
            return self.athlete.username
        return fullname

    @property
    def image_url(self):
        return reverse("map_image", kwargs={"uid": self.uid})

    @property
    def thumbnail_url(self):
        return reverse("map_thumbnail", kwargs={"uid": self.uid})

    @property
    def gpx(self):
        gpx = gpxpy.gpx.GPX()
        gpx.creator = "Mapdump.com"
        gpx_track = gpxpy.gpx.GPXTrack()
        gpx.tracks.append(gpx_track)

        gpx_segment = gpxpy.gpx.GPXTrackSegment()
        locs = self.route
        for location in locs:
            pt = gpxpy.gpx.GPXTrackPoint(
                location["latlon"][0],
                location["latlon"][1],
            )
            if location["time"]:
                pt.time = arrow.get(location["time"]).datetime
            gpx_segment.points.append(pt)
        gpx_track.segments.append(gpx_segment)
        return gpx.to_xml()

    @property
    def gpx_url(self):
        return reverse(
            "gpx_download",
            kwargs={
                "uid": self.uid,
            },
        )

    @property
    def images_path(self):
        # Deprecated
        return self.uid

    class Meta:
        ordering = ["-start_time"]
        verbose_name = "route"
        verbose_name_plural = "routes"
        indexes = [
            models.Index(fields=["-start_time"]),
        ]


register_tagged_model(Route)


class ThumbUp(models.Model):
    creation_date = models.DateTimeField(auto_now_add=True)
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="thumbsup")
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="thumbsup_given"
    )

    class Meta:
        ordering = ["-creation_date"]
        verbose_name = "thumb up"
        verbose_name_plural = "thumbs up"


class Comment(models.Model):
    creation_date = models.DateTimeField(auto_now_add=True)
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="comments_given"
    )
    message = models.TextField(
        max_length=1024,
    )

    class Meta:
        ordering = ["-creation_date"]
        verbose_name = "comment"
        verbose_name_plural = "comments"
