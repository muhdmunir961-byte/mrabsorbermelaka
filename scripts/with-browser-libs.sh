#!/usr/bin/env bash
# Playwright's Chromium links against GLib, NSS, and X11 libraries that a lean
# container image does not ship. They were fetched rootlessly into
# ~/.local/sysroot (see docs note in .clinerules/06-testing.md).
# Prepend that sysroot when it exists; a normal machine falls through unchanged.
set -euo pipefail

sysroot="${HOME}/.local/sysroot"

if [ -d "${sysroot}" ]; then
  for dir in "${sysroot}/usr/lib/x86_64-linux-gnu" "${sysroot}/lib/x86_64-linux-gnu" "${sysroot}/usr/lib"; do
    if [ -d "${dir}" ]; then
      LD_LIBRARY_PATH="${dir}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"
    fi
  done
  export LD_LIBRARY_PATH
fi

exec "$@"
