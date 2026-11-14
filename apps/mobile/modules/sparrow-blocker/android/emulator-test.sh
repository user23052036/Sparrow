#!/usr/bin/env bash
# First run of the blocking engine on Android (ROADMAP T0.5). Used by .github/workflows/android-emulator.yml
# with an emulator already booted and `adb` on PATH. Usage: emulator-test.sh path/to/app-debug.apk
#
# No backend is involved: the debug APK is debuggable, so `run-as` can write the engine's local
# state (SharedPreferences "sparrow_engine", see EngineStore.kt) exactly as a sync would leave it.
# Without a saved config SyncClient never overwrites that state. Then the Accessibility service is
# switched on through `settings put secure`, a listed app is opened, and the test asserts that
# Sparrow's blocked screen is on top. After the session ends, the same app must open normally.
set -eu # no pipefail: `adb ... | grep -q` would count grep closing the pipe early as a failure

APK="$1"
APP=com.sparrow.app
SERVICE="$APP/expo.modules.sparrowblocker.engine.SparrowAccessibilityService"
OUT="${OUT_DIR:-emulator-out}"
SESSION_SECONDS=90
mkdir -p "$OUT"

log() { echo "== $*"; }
top_activity() { adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity' || true; }
shot() { adb exec-out screencap -p >"$OUT/$1.png" || true; }

log "install $APK"
adb install -r -g "$APK"

# A launchable app that BlockRules never protects (not a dialer, SMS app, Settings or home screen).
TARGET=""
for p in com.android.deskclock com.google.android.deskclock com.android.calendar com.android.contacts com.android.camera2 com.android.gallery3d; do
  if adb shell pm path "$p" >/dev/null 2>&1; then TARGET="$p"; break; fi
done
[ -n "$TARGET" ] || { echo "No test app found on this image"; adb shell pm list packages; exit 1; }
log "target app: $TARGET"

now_ms=$(( $(adb shell date +%s | tr -d '\r') * 1000 ))
ends_ms=$(( now_ms + SESSION_SECONDS * 1000 ))
cat >"$OUT/sparrow_engine.xml" <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="session">emulator-test</string>
    <long name="ends" value="$ends_ms" />
    <set name="packages">
        <string>$TARGET</string>
    </set>
    <string name="task">Emulator test</string>
    <long name="syncedAt" value="$now_ms" />
</map>
XML
log "write a focus session ending at $ends_ms (device clock)"
adb push "$OUT/sparrow_engine.xml" /data/local/tmp/sparrow_engine.xml >/dev/null
adb shell chmod 644 /data/local/tmp/sparrow_engine.xml
adb shell am force-stop "$APP"
adb shell run-as "$APP" mkdir -p shared_prefs
adb shell run-as "$APP" cp /data/local/tmp/sparrow_engine.xml shared_prefs/sparrow_engine.xml
adb shell run-as "$APP" cat shared_prefs/sparrow_engine.xml

log "switch on the Accessibility service"
adb shell settings put secure enabled_accessibility_services "$SERVICE"
adb shell settings put secure accessibility_enabled 1
bound=""
for _ in $(seq 1 30); do
  if adb shell dumpsys accessibility | grep -q "SparrowAccessibilityService"; then bound=yes; break; fi
  sleep 1
done
adb shell dumpsys accessibility | grep -iE "Bound services|Enabled services|sparrow" || true
[ -n "$bound" ] || { echo "FAIL: the Accessibility service never connected"; exit 1; }
sleep 3

log "open $TARGET during the session"
adb shell monkey -p "$TARGET" -c android.intent.category.LAUNCHER 1 >/dev/null
blocked=""
for _ in $(seq 1 15); do
  sleep 1
  if top_activity | grep -q "BlockedActivity"; then blocked=yes; break; fi
done
top_activity | tee "$OUT/top-during.txt"
shot during-session
[ -n "$blocked" ] || { echo "FAIL: the blocked screen did not come on top of $TARGET"; adb logcat -d -t 400 >"$OUT/logcat.txt" || true; exit 1; }
log "PASS: the blocked screen covers $TARGET during the session"

log "wait for the session to end"
now_s=$(adb shell date +%s | tr -d '\r')
wait_s=$(( ends_ms / 1000 - now_s + 5 ))
[ "$wait_s" -gt 0 ] && sleep "$wait_s"
adb shell input keyevent KEYCODE_HOME
sleep 2
adb shell monkey -p "$TARGET" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 5
top_activity | tee "$OUT/top-after.txt"
shot after-session
if top_activity | grep -q "BlockedActivity"; then
  echo "FAIL: $TARGET was still blocked after the session ended"
  adb logcat -d -t 400 >"$OUT/logcat.txt" || true
  exit 1
fi
top_activity | grep -q "$TARGET" || { echo "FAIL: $TARGET did not open after the session ended"; exit 1; }
log "PASS: $TARGET opens normally after the session"
adb logcat -d -t 400 >"$OUT/logcat.txt" || true
