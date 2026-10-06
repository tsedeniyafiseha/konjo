#!/usr/bin/env bash
# Boots the two Android emulators used for testing (professional on Pixel_8,
# client on Pixel_8_Client), forwards the API (4000) and Metro (8081) ports to
# both, and pushes the sample work photos into each gallery so professionals
# can pick them when uploading portfolio or verification images.
set -euo pipefail
EMULATOR="$HOME/Library/Android/sdk/emulator/emulator"
# Every image in sample-photos/ (gitignored: drop your own pictures there) plus the project photos.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHOTOS=("$ROOT"/sample-photos/* "$ROOT"/assets/images/konjo/*.jp*)
for avd in Pixel_8 Pixel_8_Client; do
  if ! "$EMULATOR" -list-avds | grep -qx "$avd"; then echo "Missing AVD $avd (create it in Android Studio: Pixel 8, API 35)"; exit 1; fi
  pgrep -f "avd $avd" >/dev/null || (nohup "$EMULATOR" -avd "$avd" >/dev/null 2>&1 &)
done
sleep 5
for serial in $(adb devices | awk '/emulator-/ {print $1}'); do
  until [ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
  adb -s "$serial" reverse tcp:4000 tcp:4000 >/dev/null
  adb -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null
  adb -s "$serial" shell mkdir -p /sdcard/Pictures/Konjo
  n=0
  for photo in "${PHOTOS[@]}"; do
    [ -f "$photo" ] || continue
    n=$((n + 1))
    name="$(basename "$photo")"
    adb -s "$serial" push "$photo" "/sdcard/Pictures/Konjo/$name" >/dev/null
    adb -s "$serial" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Pictures/Konjo/$name" >/dev/null
  done
  echo "$serial ready (ports forwarded, $n photos in Pictures/Konjo)"
done
