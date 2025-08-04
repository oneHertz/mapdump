import json
import os.path
import re
import time
import urllib

import arrow
from allauth.account import app_settings as allauth_settings
from allauth.account.adapter import get_adapter
from allauth.account.forms import default_token_generator
from allauth.account.utils import user_username
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib.auth.signals import user_logged_in
from django.contrib.sites.shortcuts import get_current_site
from django.core.cache import cache
from django.db.models import Q
from django.http import Http404, HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404, redirect, render
from knox.models import AuthToken
from rest_framework import generics, parsers, status
from rest_framework.decorators import api_view
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import SAFE_METHODS, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from project.routedb.models import Comment, RasterMap, Route, ThumbUp, UserSettings
from project.routedb.serializers import (
    AuthTokenSerializer,
    EmailSerializer,
    LatestRouteListSerializer,
    MapListSerializer,
    ResendVerificationSerializer,
    RouteSerializer,
    UserInfoSerializer,
    UserMainSerializer,
    UserSettingsSerializer,
)
from stravalib import Client as StravaClient
from tagging.models import TaggedItem
from tagging.utils import get_tag
from project.utils.s3 import s3_object_url


def encode_filename(filename):
    return urllib.parse.quote(filename, safe="")


def x_accel_redirect(request, path, filename="", mime="application/force-download"):
    if settings.DEBUG:
        import os.path
        from wsgiref.util import FileWrapper

        path = re.sub(r"^/internal", settings.MEDIA_ROOT, path)
        if not os.path.exists(path):
            return HttpResponse(status=status.HTTP_404_NOT_FOUND)
        wrapper = FileWrapper(open(path, "rb"))
        response = HttpResponse(wrapper)
        response["Content-Length"] = os.path.getsize(path)
    else:
        response = HttpResponse("", status=status.HTTP_206_PARTIAL_CONTENT)
        response["X-Accel-Redirect"] = urllib.parse.quote(path.encode("utf-8"))
        response["X-Accel-Buffering"] = "no"
        response["Accept-Ranges"] = "bytes"
    response["Content-Type"] = mime
    if filename:
        response["Content-Disposition"] = (
            f"attachment; filename*=UTF-8''{encode_filename(filename)}"
        )
    return response


def serve_from_s3(
    bucket, request, path, filename="", mime="application/force-download"
):
    path = re.sub(r"^/internal/", "", path)
    url = s3_object_url(path, bucket)
    url = "/s3{}".format(url[len(settings.AWS_S3_ENDPOINT_URL) :])

    response_status = status.HTTP_200_OK
    if request.method == "GET":
        response_status = status.HTTP_206_PARTIAL_CONTENT

    response = HttpResponse("", status=response_status)

    if request.method == "GET":
        response["X-Accel-Redirect"] = urllib.parse.quote(url.encode("utf-8"))
        response["X-Accel-Buffering"] = "no"
    response["Accept-Ranges"] = "bytes"
    response["Content-Type"] = mime
    if filename:
        response["Content-Disposition"] = (
            f"attachment; filename*=UTF-8''{encode_filename(filename)}"
        )
    return response


class LoginView(generics.CreateAPIView):
    """
    Login View: mix of knox login view and drf obtain auth token view
    """

    throttle_classes = ()
    permission_classes = ()
    parser_classes = (
        parsers.FormParser,
        parsers.MultiPartParser,
        parsers.JSONParser,
    )
    serializer_class = AuthTokenSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.serializer_class(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        _, token = AuthToken.objects.create(user)
        user_logged_in.send(sender=user.__class__, request=request, user=user)
        return Response({"username": user.username, "token": token})


class ImpersonateView(generics.RetrieveAPIView):
    """
    Impersonate View
    """

    throttle_classes = ()
    permission_classes = (IsAdminUser,)
    parser_classes = (
        parsers.FormParser,
        parsers.MultiPartParser,
        parsers.JSONParser,
    )
    serializer_class = AuthTokenSerializer

    def retrieve(self, request, *args, **kwargs):
        username = self.kwargs.get("username")
        user = get_object_or_404(User, username__iexact=username)
        _, token = AuthToken.objects.create(user)
        return redirect(f"/login-as?username={user.username}&token={token}")


class EmailsView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = EmailSerializer

    def get_queryset(self):
        return self.request.user.emailaddress_set.all().order_by(
            "-primary", "-verified", "email"
        )

    def perform_create(self, serializer):
        return serializer.save(user=self.request.user)


class EmailDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = EmailSerializer
    lookup_field = "email"

    def get_queryset(self):
        return self.request.user.emailaddress_set.all()


class ResendVerificationView(generics.GenericAPIView):
    serializer_class = ResendVerificationSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RouteCreate(generics.CreateAPIView):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer
    permission_classes = (IsAuthenticated,)


class ListRoutesPagination(CursorPagination):
    page_size = 25
    ordering = "-start_time"


class LatestRoutesList(generics.ListAPIView):
    serializer_class = LatestRouteListSerializer
    pagination_class = ListRoutesPagination

    def get_queryset(self):
        return Route.objects.filter(
            Q(athlete_id=self.request.user.id)
            | Q(is_private=False)  # mine or public ones
        ).select_related("athlete")


class RoutesForTagList(generics.ListAPIView):
    serializer_class = LatestRouteListSerializer
    pagination_class = ListRoutesPagination

    def get_queryset(self):
        qs = Route.objects.filter(
            Q(athlete_id=self.request.user.id) | Q(is_private=False)
        ).select_related("athlete")
        tag = self.kwargs["tag"].lower()
        tag_instance = get_tag(tag)
        if tag_instance is None:
            raise Http404(f'No Tag found matching "{tag}".')
        return TaggedItem.objects.get_by_model(qs, tag_instance)


class MapsList(generics.ListAPIView):
    serializer_class = MapListSerializer

    def get_queryset(self):
        public_routes = Route.objects.filter(is_private=False)
        maps_id = set(public_routes.values_list("raster_map_id", flat=True))
        return RasterMap.objects.filter(pk__in=maps_id).prefetch_related(
            "route_set", "route_set__athlete"
        )


class UserDetail(generics.RetrieveAPIView):
    serializer_class = UserMainSerializer
    lookup_field = "username"

    def get_object(self):
        username = self.kwargs["username"]
        return self.get_queryset().get(username__iexact=username)

    def get_queryset(self):
        username = self.kwargs["username"]
        return User.objects.filter(username__iexact=username).prefetch_related("routes")


class UserSettingsDetail(generics.RetrieveUpdateAPIView):
    serializer_class = UserSettingsSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        return self.get_queryset()

    def get_queryset(self):
        user = self.request.user
        s, _ = UserSettings.objects.get_or_create(user=user)
        return s


class UserEditView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserInfoSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        return self.request.user

    def get_queryset(self):
        return User.objects.none()

    def delete(self, request, *args, **kwargs):
        token_generator = default_token_generator
        token_generator.key_salt = "AccountDeletionTokenGenerator"
        user = request.user
        conf_key = request.data.get("confirmation_key")
        if conf_key:
            if token_generator.check_token(user, conf_key):
                request.user.delete()
                return Response({"status": "ok", "message": "account deleted"})
            return Response({"status": "error", "token": "invalid token"}, status=400)

        temp_key = token_generator.make_token(user)
        current_site = get_current_site(request)
        url = f"{settings.URL_FRONT}/account-deletion-confirmation/{temp_key}"
        context = {
            "current_site": current_site,
            "user": user,
            "account_deletion_url": url,
            "request": request,
        }
        if (
            allauth_settings.AUTHENTICATION_METHOD
            != allauth_settings.AuthenticationMethod.EMAIL
        ):
            context["username"] = user_username(user)
        get_adapter(request).send_mail(
            "account/email/account_delete", request.user.email, context
        )
        return Response({"status": "ok", "message": "message sent"})


class RouteDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RouteSerializer
    lookup_field = "uid"
    queryset = Route.objects.all().select_related("athlete", "raster_map")

    def get_queryset(self):
        if self.request.method not in SAFE_METHODS:
            return super().get_queryset().filter(athlete_id=self.request.user.id)
        return (
            super()
            .get_queryset()
            .filter(Q(athlete_id=self.request.user.id) | Q(is_private=False))
        )

    def update(self, request, *args, **kwargs):
        obj = self.get_object()
        cache.delete(f"route_{obj.images_path}_h")
        cache.delete(f"route_{obj.images_path}_r")
        cache.delete(f"route_{obj.images_path}_h_r")
        cache.delete(f"route_{obj.images_path}")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        rmap = obj.raster_map
        if rmap.route_set.exclude(id=obj.id).count() == 0:
            rmap.delete()
        return super().destroy(request, *args, **kwargs)


@api_view(["GET"])
def raster_map_download(request, uid, *args, **kwargs):
    rmap = get_object_or_404(
        RasterMap.objects.filter(Q(athlete_id=request.user.id) | Q(is_private=False)),
        uid=uid,
    )
    file_path = rmap.path
    mime_type = rmap.mime_type
    return serve_from_s3(
        settings.AWS_S3_BUCKET,
        request,
        "/internal/" + file_path,
        filename="{}.{}".format(rmap.uid, mime_type[6:]),
        mime=mime_type,
    )


@api_view(["GET"])
def map_download(request, uid, *args, **kwargs):
    show_header = request.GET.get("show_header", False)
    show_route = request.GET.get("show_route", False)
    out_bounds = request.GET.get("out_bounds", False)
    route = get_object_or_404(
        Route.objects.filter(
            Q(athlete_id=request.user.id) | Q(is_private=False)
        ).select_related("raster_map"),
        uid=uid,
    )
    basename = f"{route.name}."
    mime_type = "image/jpeg"
    if show_header or show_route:
        img = route.route_image(show_header, show_route)
        filename = f"{basename}{mime_type[6:]}"
        r = HttpResponse(img, content_type=mime_type)
        r["Content-Disposition"] = (
            f"attachment; filename*=UTF-8''{encode_filename(filename)}"
        )
        return r
    elif out_bounds:
        img = route.route_image(False, False)
        filename = f"{basename}{mime_type[6:]}"
        r = HttpResponse(img, content_type=mime_type)
        r["Content-Disposition"] = (
            f"attachment; filename*=UTF-8''{encode_filename(filename)}"
        )
        return r
    file_path = route.raster_map.path
    mime_type = route.raster_map.mime_type
    return serve_from_s3(
        settings.AWS_S3_BUCKET,
        request,
        "/internal/" + file_path,
        filename="{}{}".format(basename, mime_type[6:]),
        mime=mime_type,
    )


@api_view(["GET"])
def map_thumbnail(request, uid, *args, **kwargs):
    route = get_object_or_404(
        Route.objects.filter(
            Q(athlete_id=request.user.id) | Q(is_private=False)
        ).select_related("raster_map"),
        uid=uid,
    )
    image = route.raster_map.thumbnail
    return HttpResponse(image, content_type="image/jpeg")


@api_view(["GET"])
def map_og_thumbnail(request, uid, *args, **kwargs):
    route = get_object_or_404(
        Route.objects.filter(
            Q(athlete_id=request.user.id) | Q(is_private=False)
        ).select_related("raster_map"),
        uid=uid,
    )
    image = route.raster_map.og_thumbnail
    return HttpResponse(image, content_type="image/jpeg")


@api_view(["GET"])
def gpx_download(request, uid, *args, **kwargs):
    route = get_object_or_404(
        Route.objects.filter(Q(athlete_id=request.user.id) | Q(is_private=False)),
        uid=uid,
    )
    gpx_data = route.gpx
    response = HttpResponse(gpx_data, content_type="application/gpx+xml")
    filename = f"{route.name}.gpx"
    response["Content-Disposition"] = (
        f"attachment; filename*=UTF-8''{encode_filename(filename)}"
    )
    return response


@api_view(["GET"])
@login_required
def strava_authorize(request):
    code = request.GET.get("code")
    scopes = request.GET.get("scope", "").split(",")
    if not code or "activity:read_all" not in scopes or "activity:write" not in scopes:
        return HttpResponseRedirect(settings.URL_FRONT + "/new")
    client = StravaClient()
    try:
        access_token = client.exchange_code_for_token(
            client_id=settings.MY_STRAVA_CLIENT_ID,
            client_secret=settings.MY_STRAVA_CLIENT_SECRET,
            code=code,
        )
    except Exception:
        pass
    else:
        user_settings = request.user.settings
        user_settings.strava_access_token = json.dumps(access_token)
        user_settings.save()
    return HttpResponseRedirect(settings.URL_FRONT + "/new")


@api_view(["GET"])
@login_required
def strava_access_token(request):
    user_settings = request.user.settings
    if user_settings.strava_access_token:
        token = json.loads(user_settings.strava_access_token)
        if time.time() < token["expires_at"]:
            return Response(
                {
                    "strava_access_token": token["access_token"],
                    "expires_at": token["expires_at"],
                }
            )
        client = StravaClient()
        try:
            access_token = client.refresh_access_token(
                client_id=settings.MY_STRAVA_CLIENT_ID,
                client_secret=settings.MY_STRAVA_CLIENT_SECRET,
                refresh_token=token["refresh_token"],
            )
        except Exception:
            user_settings.strava_access_token = ""
            user_settings.save()
            return Response({})
        user_settings.strava_access_token = json.dumps(access_token)
        user_settings.save()
        return Response(
            {
                "strava_access_token": access_token["access_token"],
                "expires_at": access_token["expires_at"],
            }
        )
    return Response({})


@api_view(["POST"])
@login_required
def strava_deauthorize(request):
    user_settings = request.user.settings
    if user_settings.strava_access_token:
        token = json.loads(user_settings.strava_access_token)
        client = StravaClient(token["access_token"])
        try:
            client.deauthorize()
        except Exception:
            pass
        user_settings.strava_access_token = None
        user_settings.save()
    return Response({})


@api_view(["POST"])
@login_required
def give_like_view(request, uid):
    route = get_object_or_404(Route.objects.exclude(athlete=request.user), uid=uid)
    like, created = ThumbUp.objects.get_or_create(
        route_id=route.id,
        user_id=request.user.id,
    )
    if not created:
        like.delete()
        return Response({"deleted": True})
    return Response({"created": True})


@api_view(["POST"])
@login_required
def give_comment_view(request, uid):
    route = get_object_or_404(Route.objects.exclude(athlete=request.user), uid=uid)
    message = request.data.get("message")
    c = Comment.objects.create(
        route_id=route.id,
        user_id=request.user.id,
        message=message,
    )
    return Response({"created": True, "id": c.id})


@api_view(["DELETE"])
@login_required
def edit_comment_view(request, route_uid, comment_id):
    comment = get_object_or_404(
        Comment, id=comment_id, user_id=request.user.id, route__uid=route_uid
    )
    comment.delete()
    return Response({"deleted": True})


@api_view(["GET", "POST"])
@login_required
def likes_received_view(request):
    settings, _ = UserSettings.objects.get_or_create(user=request.user)
    if request.method == "POST":
        settings.date_fetched_likes = arrow.utcnow().datetime
        settings.save(update_fields=["date_fetched_likes"])
        return Response({"ok": "ok"})
    likes = ThumbUp.objects.select_related("user", "route").filter(
        route__athlete_id=request.user.id
    )
    if since := settings.date_fetched_likes:
        likes = likes.filter(creation_date__gt=since)
    return Response(
        [
            {
                "user": UserInfoSerializer(like.user).data,
                "route": {"name": like.route.name, "uid": like.route.uid},
            }
            for like in likes
        ]
    )


@api_view(["GET", "POST"])
@login_required
def comments_received_view(request):
    settings, _ = UserSettings.objects.get_or_create(user=request.user)
    if request.method == "POST":
        settings.date_fetched_likes = arrow.utcnow().datetime
        settings.save(update_fields=["date_fetched_likes"])
        return Response({"ok": "ok"})
    comments = Comment.objects.select_related("user", "route").filter(
        route__athlete_id=request.user.id
    )
    if since := settings.date_fetched_likes:
        comments = comments.filter(creation_date__gt=since)
    return Response(
        [
            {
                "user": UserInfoSerializer(c.user).data,
                "route": {
                    "name": c.route.name,
                    "uid": c.route.uid,
                },
                "message": c.message,
            }
            for c in comments
        ]
    )


def index_view(request):
    return render(request, "frontend/index.html")


def route_view(request, route_id):
    route = get_object_or_404(
        Route.objects.all().select_related("athlete"), uid=route_id
    )
    return render(
        request, "frontend/route.html", {"route": route, "athlete": route.athlete}
    )


def athlete_view(request, athlete_username):
    athlete = get_object_or_404(User, username__iexact=athlete_username)
    return render(request, "frontend/athlete.html", {"athlete": athlete})


def athlete_avatar(request, athlete_username):
    athlete = get_object_or_404(User, username__iexact=athlete_username)

    athlete_settings, _ = UserSettings.objects.get_or_create(user=athlete)
    if athlete_settings.avatar:
        return HttpResponse(athlete_settings.avatar.read(), content_type="image/png")
    with open(
        os.path.join(settings.BASE_DIR, "routedb", "default-avatar.png"), "rb"
    ) as fp:
        return HttpResponse(fp.read(), content_type="image/png")


def athlete_day_view(request, athlete_username, date):
    athlete = get_object_or_404(User, username__iexact=athlete_username)
    date_raw = date
    date = arrow.get(date_raw).format("dddd, MMMM D, YYYY")
    return render(
        request,
        "frontend/athlete_day.html",
        {"athlete": athlete, "date": date, "date_raw": date_raw},
    )
