"""mapdump URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView

from project.routedb import views

urlpatterns = [
    re_path(
        r"admin/impersonate/(?P<username>[a-zA-Z0-9_-]+)/?$",
        views.ImpersonateView.as_view(),
        name="impersonate",
    ),
    path("admin/", admin.site.urls),
    path("drf-auth/", include("rest_framework.urls", namespace="rest_framework")),
    path("api/v1/", include("project.routedb.urls")),
    path("", views.index_view, name="index"),
    re_path(
        r"^password-reset-confirmation/(?P<uidb64>[0-9A-Za-z_\-]+):(?P<token>[0-9A-Za-z]{1,13}-[0-9A-Za-z]{1,32})/$",
        TemplateView.as_view(template_name="base.html"),
        name="password_reset_confirm",
    ),
    re_path(
        r"routes/(?P<route_id>[a-zA-Z0-9_-]{11})/?$",
        views.route_view,
        name="route_page",
    ),
    re_path(
        r"athletes/(?P<athlete_username>[a-zA-Z0-9_-]{2,})/?$",
        views.athlete_view,
        name="athlete_page",
    ),
    re_path(
        r"athletes/(?P<athlete_username>[a-zA-Z0-9_-]{2,}).png$",
        views.athlete_avatar,
        name="athlete_avatar",
    ),
    re_path(
        r"athletes/(?P<athlete_username>[a-zA-Z0-9_-]{2,})/(?P<date>\d{4}-\d{2}-\d{2})/?$",
        views.athlete_day_view,
        name="athlete_day_page",
    ),
    re_path(r".+", TemplateView.as_view(template_name="base.html"), name="catch_all"),
]
