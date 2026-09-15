#!/bin/sh
ROOT="${VIDEO_ROOT:-/videos}"
CONFIG="${CONFIG_ROOT:-/config}"
NAS_MNT="${NAS_MOUNT_POINT:-/mnt/nas}"
mkdir -p "$ROOT" "$CONFIG" "$NAS_MNT"
# Freezer/ mkdir + write probe happen in node so errors show in the UI.
exec node /app/worker.js
