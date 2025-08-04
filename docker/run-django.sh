#!/bin/sh
if [ "$1" = "pytest" ]; then
    shift
    /wait-for-it.sh --host=db --port=5432
    exec pytest "$@"
else
    exec /venv/bin/python /app/manage.py runserver 0.0.0.0:${RUNSERVER_PORT-8000}
fi
