import base64
import re
from io import BytesIO

from allauth.account.models import EmailAddress
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Q
from django.utils.safestring import mark_safe
from django.utils.translation import gettext_lazy as _
from PIL import Image
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from routedb.models import Comment, RasterMap, Route, ThumbUp, UserSettings
from utils.validators import (
    custom_username_validators,
    validate_latitude,
    validate_longitude,
)

HASHTAG_REGEX = re.compile(r"(^|\B)#(?![0-9_]+\b)([a-zA-Z0-9_]{1,30})(\b|\r)")


class AuthTokenSerializer(serializers.Serializer):
    username = serializers.CharField(label=_("Username"), write_only=True)
    password = serializers.CharField(
        label=_("Password"),
        style={"input_type": "password"},
        trim_whitespace=False,
        write_only=True,
    )
    token = serializers.CharField(label=_("Token"), read_only=True)

    def validate(self, attrs):
        username = attrs.get("username")
        password = attrs.get("password")

        if username and password:
            user = authenticate(
                request=self.context.get("request"),
                username=username,
                password=password,
            )

            # The authenticate call simply returns None for is_active=False
            # users. (Assuming the default ModelBackend authentication
            # backend.)
            if not user:
                msg = _("Unable to log in with provided credentials.")
                raise serializers.ValidationError(msg, code="authorization")
            if not EmailAddress.objects.filter(user=user, verified=True).exists():
                raise serializers.ValidationError(
                    mark_safe(
                        _(
                            'Please verify your email address or <a href="/verify-email">resend verification</a>'
                        )
                    ),
                    code="authorization",
                )
        else:
            msg = _('Must include "username" and "password".')
            raise serializers.ValidationError(msg, code="authorization")

        attrs["user"] = user
        return attrs


class RelativeURLField(serializers.ReadOnlyField):
    """
    Field that returns a link to the relative url.
    """

    def to_representation(self, value):
        request = self.context.get("request")
        url = request and request.build_absolute_uri(value) or ""
        return url


class UserSettingsSerializer(serializers.ModelSerializer):
    avatar_base64 = serializers.CharField(source="avatar_b64", write_only=True)

    def validate_avatar_base64(self, value):
        if not value:
            return None
        if not value.startswith("data:image/png;base64,"):
            raise ValidationError("The image should be a base 64 encoded PNG")
        content_b64 = value.partition("base64,")[2]
        in_buf = BytesIO()
        in_buf.write(base64.b64decode(content_b64))
        with Image.open(in_buf) as image:
            rgba_img = image.convert("RGBA")
            target = 256
            if image.size[0] != image.size[1]:
                raise ValidationError("The image should be square")
            if image.size[0] < 128:
                raise ValidationError("The image is too small, < 128px width")
            if image.size[0] > target:
                rgba_img.thumbnail((target, target), Image.LANCZOS)
            out_buffer = BytesIO()
            params = {
                "dpi": (72, 72),
            }
            rgba_img.save(out_buffer, "PNG", **params)
            data_b64 = base64.b64encode(out_buffer.getvalue()).decode()
            return f"data:image/png;base64,{data_b64}"

    class Meta:
        model = UserSettings
        fields = ("avatar_base64",)


class UserInfoSerializer(serializers.ModelSerializer):
    username = serializers.CharField(validators=custom_username_validators)

    class Meta:
        model = User
        fields = ("username", "first_name", "last_name")


class RouteThumbUpSerializer(serializers.ModelSerializer):
    creation_date = serializers.ReadOnlyField()
    user = UserInfoSerializer()

    class Meta:
        model = ThumbUp
        fields = (
            "creation_date",
            "user",
        )


class RouteCommentSerializer(serializers.ModelSerializer):
    creation_date = serializers.ReadOnlyField()
    user = UserInfoSerializer()

    class Meta:
        model = Comment
        fields = (
            "id",
            "creation_date",
            "message",
            "user",
        )


class RouteSerializer(serializers.ModelSerializer):
    map_image = serializers.ImageField(
        source="raster_map.image", write_only=True, required=False
    )
    map_id = serializers.ChoiceField(
        [], source="raster_map.uid", allow_blank=True, required=False
    )
    gpx_url = RelativeURLField()
    map_url = RelativeURLField(source="image_url")
    map_thumbnail_url = RelativeURLField(source="thumbnail_url")
    route_data = serializers.JSONField(source="route")
    map_bounds = serializers.JSONField(source="raster_map.bounds", required=False)
    id = serializers.ReadOnlyField(source="uid")
    athlete = UserInfoSerializer(read_only=True)
    country = serializers.ReadOnlyField()
    tz = serializers.ReadOnlyField()
    modification_date = serializers.ReadOnlyField()
    distance = serializers.ReadOnlyField()
    duration = serializers.ReadOnlyField()
    map_size = serializers.ReadOnlyField(source="raster_map.size")
    start_time = serializers.DateTimeField(required=False)
    is_private = serializers.BooleanField(required=False)
    thumbsup = RouteThumbUpSerializer(many=True, read_only=True)
    comments = RouteCommentSerializer(many=True, read_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["map_id"].choices = [None] + list(
            RasterMap.objects.all().values_list("uid", flat=True)
        )

    def validate_map_bounds(self, value):
        if not value:
            return None
        if not isinstance(value, dict):
            raise ValidationError("Invalid bounds")
        for x in "top_left", "top_right", "bottom_right", "bottom_left":
            if x not in value or len(value[x]) != 2:
                raise ValidationError("Invalid bounds")
            validate_latitude(value[x][0])
            validate_longitude(value[x][1])
        return value

    def validate_route_data(self, value):
        if not isinstance(value, list) or len(value) <= 0:
            raise ValidationError("Invalid route data")
        for x in value:
            if "time" not in x or not isinstance(x["time"], (type(None), float, int)):
                raise ValidationError("Invalid route data")
            if (
                "latlon" not in x
                or not isinstance(x["latlon"], list)
                or len(x["latlon"]) != 2
            ):
                raise ValidationError("Invalid route data")
            validate_latitude(x["latlon"][0])
            validate_longitude(x["latlon"][1])
        return value

    def validate(self, data):
        request = self.context.get("request")
        if request and request.method in ("PUT", "PATCH"):
            if data.get("raster_map"):
                raise ValidationError("This method does not allow to update to map")
        else:  # Method is POST
            if data.get("start_time"):
                if data.get("route_data", {}).get("time", [None])[0]:
                    raise ValidationError("Route data already include time")
            if not data.get("raster_map", {}).get("uid") and not data.get(
                "raster_map", {}
            ).get("image"):
                raise ValidationError(
                    "Either set map_image or map_id %r %r"
                    % (request.method, data.get("raster_map"))
                )
            if data.get("raster_map", {}).get("uid") and data.get("raster_map", {}).get(
                "image"
            ):
                raise ValidationError("Either set map_image or map_id, not both")
            if (
                not data.get("raster_map", {}).get("uid")
                and data.get("raster_map", {}).get("image")
                and not data.get("raster_map", {})["bounds"]
            ):
                raise ValidationError(
                    "You must define map_bounds fields along with map_image"
                )
        return data

    def create(self, validated_data):
        user = None
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            user = request.user

        if validated_data.get("raster_map", {}).get("uid"):
            raster_map = RasterMap.objects.get(uid=validated_data["raster_map"]["uid"])
        else:
            raster_map = RasterMap(
                uploader=user,
                image=validated_data["raster_map"]["image"],
                mime_type=validated_data["raster_map"]["image"].content_type,
            )
            raster_map.bounds = validated_data["raster_map"]["bounds"]
            raster_map.prefetch_map_extras()
            raster_map.save()
        route = Route(
            athlete=user,
            raster_map=raster_map,
            name=validated_data["name"],
            comment=validated_data["comment"],
        )
        if validated_data.get("start_time"):
            route.start_time = validated_data["start_time"]
        if validated_data.get("is_private"):
            route.is_private = True
        route.route = validated_data["route"]
        route.prefetch_route_extras()
        route.save()
        return route

    def save(self):
        super().save()
        instance = self.instance
        instance.prefetch_route_extras()
        instance.save()
        comment = instance.comment
        instance.tags = ", ".join(
            hashtag_match.group(2).lower()
            for hashtag_match in re.finditer(HASHTAG_REGEX, comment)
        )

    class Meta:
        model = Route
        fields = (
            "id",
            "athlete",
            "name",
            "start_time",
            "modification_date",
            "tz",
            "distance",
            "duration",
            "country",
            "map_image",
            "map_id",
            "gpx_url",
            "map_url",
            "map_thumbnail_url",
            "map_bounds",
            "map_size",
            "comment",
            "route_data",
            "is_private",
            "thumbsup",
            "comments",
        )


class UserRouteListSerializer(serializers.ModelSerializer):
    url = RelativeURLField(source="api_url")
    id = serializers.ReadOnlyField(source="uid")
    country = serializers.ReadOnlyField()
    map_url = RelativeURLField(source="image_url")
    map_thumbnail_url = RelativeURLField(source="thumbnail_url")
    tz = serializers.ReadOnlyField()
    start_time = serializers.ReadOnlyField()
    distance = serializers.ReadOnlyField()
    duration = serializers.ReadOnlyField()

    class Meta:
        model = Route
        fields = (
            "id",
            "url",
            "map_url",
            "map_thumbnail_url",
            "start_time",
            "tz",
            "distance",
            "duration",
            "country",
            "name",
            "is_private",
        )


class LatestRouteListSerializer(serializers.ModelSerializer):
    url = RelativeURLField(source="api_url")
    id = serializers.ReadOnlyField(source="uid")
    country = serializers.ReadOnlyField()
    map_url = RelativeURLField(source="image_url")
    map_thumbnail_url = RelativeURLField(source="thumbnail_url")
    tz = serializers.ReadOnlyField()
    start_time = serializers.ReadOnlyField()
    distance = serializers.ReadOnlyField()
    duration = serializers.ReadOnlyField()
    athlete = UserInfoSerializer(read_only=True)

    class Meta:
        model = Route
        fields = (
            "id",
            "url",
            "map_url",
            "map_thumbnail_url",
            "start_time",
            "tz",
            "distance",
            "duration",
            "country",
            "name",
            "athlete",
            "is_private",
        )


class UserMainSerializer(serializers.ModelSerializer):
    # latest_routes = serializers.SerializerMethodField()
    # routes = UserRouteListSerializer(many=True)
    routes = serializers.SerializerMethodField("get_public_or_own_routes")

    class Meta:
        model = User
        fields = ("username", "first_name", "last_name", "routes")

    def get_public_or_own_routes(self, obj):
        filters = Q(is_private=False)
        if self.context.get("request"):
            filters |= Q(athlete_id=self.context["request"].user.id)
        return UserRouteListSerializer(
            instance=obj.routes.filter(filters), many=True, context=self.context
        ).data


class EmailSerializer(serializers.ModelSerializer):
    class Meta(object):
        fields = ("email", "primary", "verified")
        model = EmailAddress
        read_only_fields = ("verified",)

    def create(self, validated_data):
        email = super(EmailSerializer, self).create(validated_data)
        email.send_confirmation()
        user = validated_data.get("user")
        query = EmailAddress.objects.filter(primary=True, user=user)
        if not query.exists():
            email.set_as_primary()
        return email

    def update(self, instance, validated_data):
        primary = validated_data.pop("primary", False)
        instance = super(EmailSerializer, self).update(instance, validated_data)
        if primary:
            instance.set_as_primary()
        return instance

    def validate_email(self, email):
        user, domain = email.rsplit("@", 1)
        email = "@".join([user, domain.lower()])

        if self.instance and email and self.instance.email != email:
            raise serializers.ValidationError(
                _("Existing emails may not be edited. Create a new one " "instead.")
            )

        return email

    def validate_primary(self, primary):
        # TODO: Setting 'is_primary' to 'False' should probably not be
        #       allowed.
        if primary and not (self.instance and self.instance.verified):
            raise serializers.ValidationError(
                _(
                    "Unverified email addresses may not be used as the "
                    "primary address."
                )
            )
        return primary


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def save(self):
        try:
            email = EmailAddress.objects.get(
                email__iexact=self.validated_data["email"], verified=False
            )
            email.send_confirmation()
        except EmailAddress.DoesNotExist:
            # email does not exists in db, just ignore
            pass


class MapListSerializer(serializers.ModelSerializer):
    id = serializers.ReadOnlyField(source="uid")
    image_url = RelativeURLField()
    bounds = serializers.JSONField()
    routes = LatestRouteListSerializer(source="route_set", many=True)

    class Meta:
        model = RasterMap
        fields = ("id", "image_url", "country", "bounds", "routes")
