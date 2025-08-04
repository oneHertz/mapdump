from django.core.management.base import BaseCommand
from project.routedb.models import RasterMap


class Command(BaseCommand):
    help = "Strip map images from exif data"

    def handle(self, *args, **options):
        qs = RasterMap.objects.all()
        for raster_map in qs:
            raster_map.strip_exif()
            raster_map.save()
        self.stdout.write(self.style.SUCCESS("Done"))
