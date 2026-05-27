#!/bin/sh
set -eu

: "${DATA_DIR:=/data/data}"
: "${OUTPUT_DIR:=/data/out}"

mkdir -p "$DATA_DIR" "$OUTPUT_DIR"
chown -R appuser:appuser "$DATA_DIR" "$OUTPUT_DIR"

# Apply DB schema updates on persistent volume before app start.
# This repository currently has two migration heads, so we upgrade all heads.
gosu appuser alembic upgrade heads

exec gosu appuser "$@"
