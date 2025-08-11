FROM python:3.13-bookworm

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1

ADD requirements.txt .

RUN uv venv /opt/venv

ENV VIRTUAL_ENV="/opt/venv/"
ENV PATH="/opt/venv/bin:$PATH"
ENV LD_LIBRARY_PATH="/usr/local/lib"
RUN uv pip install -r requirements.txt

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && \
    apt-get clean -y && \
    rm -rf /var/lib/apt/lists/* /usr/share/doc /usr/share/man

RUN curl -sL https://deb.nodesource.com/setup_20.x | bash
RUN apt-get -y install nodejs

RUN mkdir /.npm/
RUN chmod -R 777 /.npm/

ADD . /app/

RUN npm add pnpm -g

RUN npm add yarn -g
RUN cd /app/project/jstools/ && yarn install
RUN chmod a+x /app/project/jstools/generate_map.js

ENV DJANGO_SETTINGS_MODULE=project.settings

RUN DATABASE_URL="sqlite://:memory:" python manage.py collectstatic --noinput
