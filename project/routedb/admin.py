from django.contrib import admin, messages
from django.core.cache import cache
from django.utils.translation import ngettext

from project.routedb.models import RasterMap, Route, UserSettings


class RasterMapAdmin(admin.ModelAdmin):
    list_display = (
        "uploader",
        "creation_date",
        "uid",
    )
    fields = (
        "uploader",
        "image",
        "corners_coordinates",
    )
    actions = ["rotate_90", "rotate_180", "rotate_270"]

    @admin.action(description="Rotate 90°")
    def rotate_90(self, request, qs):
        for m in qs:
            m.rotate(1)

    @admin.action(description="Rotate 180°")
    def rotate_180(self, request, qs):
        for m in qs:
            m.rotate(2)

    @admin.action(description="Rotate 270°")
    def rotate_270(self, request, qs):
        for m in qs:
            m.rotate(3)


class RouteAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "start_time",
        "athlete",
    )
    fields = ("athlete", "name", "route_json", "raster_map", "is_private")
    list_filter = ("athlete",)
    actions = ["clear_images"]

    @admin.action(description="Clear images cache")
    def clear_images(self, request, qs):
        for r in qs:
            cache.delete(f"route_{r.images_path}_h")
            cache.delete(f"route_{r.images_path}_r")
            cache.delete(f"route_{r.images_path}_h_r")
            cache.delete(f"route_{r.images_path}")
            cache.delete(f"map_{r.raster_map.image.name}_thumb")
        updated = qs.count()

        self.message_user(
            request,
            ngettext(
                "%d route images was cleared.",
                "%d routes images were cleared.",
                updated,
            )
            % updated,
            messages.SUCCESS,
        )


class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ("user", "strava_access_token", "avatar")
    list_filter = ("user",)


admin.site.register(RasterMap, RasterMapAdmin)
admin.site.register(Route, RouteAdmin)
admin.site.register(UserSettings, UserSettingsAdmin)
