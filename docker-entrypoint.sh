#!/bin/sh
set -eu

: "${DATA_DIR:=/data/data}"
: "${OUTPUT_DIR:=/data/out}"

mkdir -p "$DATA_DIR" "$OUTPUT_DIR"
chown -R appuser:appuser "$DATA_DIR" "$OUTPUT_DIR"

# Apply DB schema updates on persistent volume before app start.
gosu appuser alembic upgrade head

exec gosu appuser "$@"
