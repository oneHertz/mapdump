from django.conf import settings
from django.contrib.sites.shortcuts import get_current_site

from allauth.account import app_settings as allauth_settings
from allauth.account.adapter import get_adapter
from allauth.account.forms import default_token_generator
from allauth.account.utils import (
    setup_user_email,
    user_pk_to_url_str,
    user_username,
)
from allauth.account.models import EmailAddress
from allauth.utils import get_username_max_length

from dj_rest_auth.forms import AllAuthPasswordResetForm as OrigResetForm
from dj_rest_auth.serializers import PasswordResetSerializer
from rest_framework import serializers


def email_address_exists(email):
    return EmailAddress.objects.filter(email=email).exists()


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=get_username_max_length(),
        min_length=allauth_settings.USERNAME_MIN_LENGTH,
        required=allauth_settings.USERNAME_REQUIRED,
    )
    first_name = serializers.CharField(max_length=30)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=True)
    password1 = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)
    _has_phone_field = False

    def validate_username(self, username):
        username = get_adapter().clean_username(username)
        return username

    def validate_email(self, email):
        email = get_adapter().clean_email(email)
        if allauth_settings.UNIQUE_EMAIL:
            if email and email_address_exists(email):
                raise serializers.ValidationError(
                    "A user is already registered with this e-mail address."
                )
        return email

    def validate_password1(self, password):
        return get_adapter().clean_password(password)

    def validate(self, data):
        if data["password1"] != data["password2"]:
            raise serializers.ValidationError("The two password fields didn't match.")
        return data

    def custom_signup(self, request, user):
        pass

    def get_cleaned_data(self):
        return {
            "username": self.validated_data.get("username", ""),
            "password1": self.validated_data.get("password1", ""),
            "email": self.validated_data.get("email", ""),
            "first_name": self.validated_data.get("first_name"),
            "last_name": self.validated_data.get("last_name"),
        }

    def save(self, request):
        adapter = get_adapter()
        user = adapter.new_user(request)
        self.cleaned_data = self.get_cleaned_data()
        adapter.save_user(request, user, self)
        self.custom_signup(request, user)
        setup_user_email(request, user, [])
        return user


class CustomPasswordResetForm(OrigResetForm):
    def save(self, request, **kwargs):
        current_site = get_current_site(request)
        email = self.cleaned_data["email"]
        token_generator = default_token_generator

        for user in self.users:
            temp_key = token_generator.make_token(user)

            url = f"{settings.URL_FRONT}/password-reset-confirmation/{user_pk_to_url_str(user)}:{temp_key}"

            context = {
                "current_site": current_site,
                "user": user,
                "password_reset_url": url,
                "request": request,
            }
            if (
                allauth_settings.AUTHENTICATION_METHOD
                != allauth_settings.AuthenticationMethod.EMAIL
            ):
                context["username"] = user_username(user)
            get_adapter(request).send_mail(
                "account/email/password_reset_key", email, context
            )
        return self.cleaned_data["email"]


class CustomPasswordResetSerializer(PasswordResetSerializer):
    password_reset_form_class = CustomPasswordResetForm
