#!/bin/bash
# isolate 2.x dropped --cg-timing/--no-cg-timing (control-group mode always
# times this way now), but judge0 1.13.1's Ruby code still passes one of
# them on every invocation. Strip them here rather than patching the app.
filtered=()
for arg in "$@"; do
  case "$arg" in
    --cg-timing | --no-cg-timing) ;;
    *) filtered+=("$arg") ;;
  esac
done
exec /usr/local/bin/isolate.real "${filtered[@]}"
