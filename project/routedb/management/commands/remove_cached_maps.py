from django.core.cache import cache
from django.core.management.base import BaseCommand
from project.routedb.models import Route


class Command(BaseCommand):
    help = "Remove image cache"

    def handle(self, *args, **options):
        qs = Route.objects.all()
        for r in qs:
            cache.delete(f"route_{r.images_path}_h")
            cache.delete(f"route_{r.images_path}_r")
            cache.delete(f"route_{r.images_path}_h_r")
            cache.delete(f"route_{r.images_path}")
            cache.delete(f"map_{r.raster_map.image.name}_thumb")
        self.stdout.write(self.style.SUCCESS("Done"))
