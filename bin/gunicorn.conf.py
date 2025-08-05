wsgi_app = "project.wsgi:application"
preload_app = True
daemon = False
raw_env = ["DJANGO_SETTINGS_MODULE=project.settings"]
workers = 2
threads = 2
max_requests = 500
max_requests_jitter = 40
