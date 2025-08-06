import os
import subprocess
import time

from bs4 import BeautifulSoup
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

index_path = os.path.join(settings.BUILD_DIR, "index.html")
output_path = os.path.join(settings.TEMPLATES_DIR, "base-react.html")


class Command(BaseCommand):
    help = "Collect React index.html and static files"

    def handle(self, *args, **kwargs):
        t0 = time.time()
        client_dir = getattr(settings, "CLIENT_DIR")
        if not client_dir or not os.path.exists(client_dir):
            self.stdout.write(self.style.ERROR("No client directory found"))
            return

        env = dict(os.environ)
        env["CI"] = "true"
        self.stdout.write("Building client app ...")
        subprocess.check_output(
            [settings.YARN_PATH, "install"], cwd=client_dir, env=env
        )

        subprocess.check_output([settings.YARN_PATH, "build"], cwd=client_dir, env=env)

        self.stdout.write("Collecting static files ...")
        call_command("collectstatic", interactive=False, clear=True, verbosity=0)

        exists = os.path.exists(index_path)
        if not exists:
            # print or raise error
            self.stdout.write(self.style.ERROR("No index path"))
            return

        html = open(index_path).read()
        soup = BeautifulSoup(html, "html.parser")

        soup.title.replace_with("{% block head %}{% endblock head %}")

        root = soup.find("div", id="root")
        root.insert_before("{% block body %}")
        root.insert_after("{% endblock body %}")

        style = soup.new_tag("style", type="text/css")
        style.string = "{% block css %}{% endblock css %}"

        soup.head.insert(len(soup.head.contents), style)

        with open(output_path, "w", encoding="utf-8") as file:
            file.write(str(soup))

        self.stdout.write(self.style.SUCCESS(f"Exported file: {output_path}"))
        total_time = time.time() - t0
        self.stdout.write(f"Completed in {total_time}s")
