from django.core.management.base import BaseCommand

from project.routedb.models import RasterMap


class Command(BaseCommand):
    help = "fill auto generated field"

    def handle(self, *args, **options):
        qs = RasterMap.objects.all()
        for r in qs:
            r.prefetch_map_extras()
            r.save()
        self.stdout.write(self.style.SUCCESS("Done"))
