FROM python:3.11-bookworm

# Copy in your requirements file
ADD requirements.txt /requirements.txt

# OR, if you’re using a directory for your requirements, copy everything (comment out the above and uncomment this if so):
# ADD requirements /requirements

# Install build deps, then run `pip install`, then remove unneeded build deps all in a single step. Correct the path to your production requirements file, if needed.
RUN set -ex \
    && python -m venv /venv \
    && /venv/bin/pip install -r /requirements.txt

# Copy your application code to the container (make sure you create a .dockerignore file if any large files or directories should be excluded)
RUN mkdir /app/
WORKDIR /app/
ADD . /app/

RUN mkdir /.npm/
RUN chmod -R 777 /.npm/

# uWSGI will listen on this port
EXPOSE 8000

# Add any custom, static environment variables needed by Django or your settings file here:
ENV DJANGO_SETTINGS_MODULE=project.settings

# uWSGI configuration (customize as needed):
# ENV UWSGI_VIRTUALENV=/venv UWSGI_WSGI_FILE=routechoices/wsgi.py UWSGI_HTTP=:8000 UWSGI_MASTER=1 UWSGI_WORKERS=2 UWSGI_THREADS=8 UWSGI_UID=1000 UWSGI_GID=2000 UWSGI_LAZY_APPS=1 UWSGI_WSGI_ENV_BEHAVIOR=holy


# ENTRYPOINT ["/app/docker-entrypoint.sh"]
# Start uWSGI
# CMD ["/venv/bin/uwsgi", "--http-auto-chunked", "--http-keepalive"]


# install node for tools
# update
RUN apt-get update
# install canvas dependencies
RUN apt-get -y install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
# get install script and pass it to execute:
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash
# and install node
RUN apt-get -y install nodejs
RUN node --version
RUN npm --version
RUN npm add yarn -g
RUN cd /app/project/jstools/ && npm install

RUN chmod a+x /app/project/jstools/generate_map.js


ADD docker/wait-for-it.sh /wait-for-it.sh
ADD docker/run-django.sh /run.sh
RUN chmod 755 /wait-for-it.sh /run.sh
ENTRYPOINT ["/run.sh"]
