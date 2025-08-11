from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.syndication.views import Feed

from project.routedb.models import Route


class LatestRoutesFeed(Feed):
    def title(self):
        return "Latest routes on Mapdump.com"

    def description(self):
        return "Routes on Mapdump sorted by latest first"

    def link(self):
        return "{}/".format(settings.URL_FRONT)

    def items(self):
        return Route.objects.all().prefetch_related("athlete")[:24]

    def item_title(self, item):
        return item.name

    def item_description(self, item):
        return "Route {} by {} {}".format(
            item.name, item.athlete.first_name, item.athlete.last_name
        )

    def item_pubdate(self, item):
        return item.start_time

    def item_link(self, item):
        return "{}/routes/{}".format(settings.URL_FRONT, item.uid)


class AtheleteRoutesFeed(Feed):
    def get_object(self, request, username):
        return User.objects.all().prefetch_related("routes").get(username=username)

    def title(self, obj):
        return "Routes by {} {} on Mapdump.com".format(
            obj.first_name,
            obj.last_name,
        )

    def description(self, obj):
        return "Routes by {} {} on Mapdump.com".format(
            obj.first_name,
            obj.last_name,
        )

    def link(self, obj):
        return "{}/athletes/{}".format(settings.URL_FRONT, obj.username)

    def items(self, obj):
        return Route.objects.filter(
            athlete=obj,
        )

    def item_title(self, item):
        return item.name

    def item_description(self, item):
        return "Route {} by {} {}".format(
            item.name, item.athlete.first_name, item.athlete.last_name
        )

    def item_pubdate(self, item):
        return item.start_time

    def item_link(self, item):
        return "{}/routes/{}".format(settings.URL_FRONT, item.uid)


latest_routes_feed = LatestRoutesFeed()
athlete_routes_feed = AtheleteRoutesFeed()
