#!/usr/bin/env bash
# Compiles the Android-free blocking rules (apps and websites) and runs their tests on a plain JVM.
# Needs kotlinc on PATH (https://kotlinlang.org/docs/command-line.html). No Android SDK required.
set -euo pipefail
cd "$(dirname "$0")"
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
KLIB="$(dirname "$(dirname "$(command -v kotlinc)")")/lib"
kotlinc src/main/java/expo/modules/sparrowblocker/engine/BlockRules.kt \
  src/main/java/expo/modules/sparrowblocker/engine/DnsRules.kt \
  src/test/java/expo/modules/sparrowblocker/engine/BlockRulesTest.kt \
  src/test/java/expo/modules/sparrowblocker/engine/DnsRulesTest.kt \
  -cp "$KLIB/kotlin-test.jar" -d "$OUT/t.jar" 2>&1 | grep -v "^warning" || true
kotlin -cp "$OUT/t.jar:$KLIB/kotlin-test.jar" expo.modules.sparrowblocker.engine.BlockRulesTest
kotlin -cp "$OUT/t.jar:$KLIB/kotlin-test.jar" expo.modules.sparrowblocker.engine.DnsRulesTest
