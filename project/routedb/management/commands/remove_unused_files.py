from django.conf import settings
from django.core.management.base import BaseCommand
from project.routedb.models import RasterMap, UserSettings
from project.utils.s3 import get_s3_client, s3_delete_key


class Command(BaseCommand):
    help = "Remove unused image file from storage"

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", default=False)

    def scan_directory(self, directory):
        # Should use v2 but wasabi fails to list all files with it
        # paginator = s3.get_paginator('list_objects_v2')
        paginator = self.s3.get_paginator("list_objects")
        kwargs = {
            "Bucket": settings.AWS_S3_BUCKET,
            "Prefix": directory,
        }
        for page in paginator.paginate(**kwargs):
            try:
                contents = page["Contents"]
            except KeyError:
                break
            for obj in contents:
                key = obj["Key"]
                yield key

    def process_image_file(self, image_name, force):
        if image_name not in self.image_paths:
            self.n_image_removed += 1
            self.stdout.write(f"File {image_name} is unused")
            if force:
                s3_delete_key(image_name, settings.AWS_S3_BUCKET)
        else:
            self.stdout.write(f"File {image_name} is used")
            self.n_image_keeped += 1

    def handle(self, *args, **options):
        force = options["force"]
        self.image_paths = set(RasterMap.objects.values_list("image", flat=True))

        self.image_paths.update(
            set(
                UserSettings.objects.all()
                .exclude(avatar__isnull=True)
                .exclude(avatar="")
                .values_list("avatar", flat=True)
            )
        )
        self.n_image_removed = 0
        self.n_image_keeped = 0
        self.s3 = get_s3_client()
        for directory in ("maps", "avatars"):
            for filename in self.scan_directory(directory):
                self.process_image_file(filename, force)

        if force:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully removed {self.n_image_removed} files, "
                    f"keeping {self.n_image_keeped}"
                )
            )
        else:
            self.stdout.write(
                f"Would remove {self.n_image_removed} files, "
                f"keeping {self.n_image_keeped}"
            )
