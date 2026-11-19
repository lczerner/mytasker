#!/bin/sh
# SPDX-License-Identifier: MIT
# Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
# Creates the empty folder skeleton of the shared root (docs/architecture.md §3).
# Usage: ./create-folders.sh <root>
set -eu
root=${1:?usage: create-folders.sh <root>}
mkdir -p "$root/app" "$root/roles/ops" "$root/roles/checkpoints" "$root/data/ops" "$root/data/checkpoints" "$root/data/files" "$root/enroll"
echo "Created skeleton in $root. Copy the content of release/app/ into $root/app/."
