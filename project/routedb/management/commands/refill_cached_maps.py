from django.core.management.base import BaseCommand

from project.routedb.models import Route


class Command(BaseCommand):
    help = "Remove image cache"

    def generate_thumb(self, route):
        _ = route.raster_map.thumbnail

    def generate_map(self, route, show_header, show_route):
        _ = route.route_image(show_header, show_route)

    def handle(self, *args, **options):
        qs = Route.objects.all()
        for r in qs:
            print("Processing route: {} by {}".format(r.name, r.athlete))
            self.generate_thumb(r)
            self.generate_map(r, True, False)
            self.generate_map(r, True, True)
            self.generate_map(r, False, True)
            self.generate_map(r, False, False)
        self.stdout.write(self.style.SUCCESS("Done"))
