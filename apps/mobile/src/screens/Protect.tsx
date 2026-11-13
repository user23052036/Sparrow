import { useCallback, useEffect, useState } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { copy } from "@sparrow/shared";
import { engine, isNativeAvailable, type EngineState, type WebBlocking } from "../../modules/sparrow-blocker/src";
import { setUpEngine } from "../device";
import { Button } from "../ui";
import { s } from "../theme";

/** Brands known to stop background apps unless "autostart" is allowed (dontkillmyapp.com). */
const AUTOSTART_BRANDS = ["xiaomi", "redmi", "poco", "oppo", "realme", "oneplus", "vivo", "iqoo", "huawei", "honor", "samsung"];

function ago(ms: number): string {
  if (!ms) return "never";
  const s2 = Math.round((Date.now() - ms) / 1000);
  return s2 < 90 ? `${s2} s ago` : `${Math.round(s2 / 60)} min ago`;
}

/** M5b-4: the honest disclosure and the three settings Android needs for reliable blocking. */
export function Protect() {
  const [on, setOn] = useState(engine.protectionOn());
  const [battery, setBattery] = useState(engine.batteryOk());
  const [state, setState] = useState<EngineState | null>(engine.state());
  const [note, setNote] = useState<string | null>(null);
  const [web, setWeb] = useState<WebBlocking>(engine.webBlocking());
  const brand = engine.manufacturer();
  const needsAutostart = AUTOSTART_BRANDS.some((b) => brand.toLowerCase().includes(b));

  const refresh = useCallback(async () => {
    setOn(engine.protectionOn());
    setBattery(engine.batteryOk());
    await setUpEngine();
    setState(engine.state());
    setWeb(engine.webBlocking());
  }, []);

  useEffect(() => {
    void refresh();
    // Coming back from Settings: check again.
    const sub = AppState.addEventListener("change", (st) => st === "active" && void refresh());
    return () => sub.remove();
  }, [refresh]);

  if (!isNativeAvailable)
    return (
      <ScrollView style={s.screen} contentContainerStyle={s.body}>
        <Text style={s.h1}>{copy.protect.title}</Text>
        <Text style={s.text}>{copy.protect.devBuild}</Text>
      </ScrollView>
    );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body}>
      <Text style={s.h1}>{copy.protect.title}</Text>
      <View style={s.note}>
        <Text style={s.text}>{on && state?.configured ? copy.protect.ready : copy.protect.notReady}</Text>
        {state?.configured && <Text style={s.quiet}>{copy.protect.lastSync(ago(state.lastSyncMs))}</Text>}
        {state?.status === "signed_out" && <Text style={s.text}>{copy.protect.signedOut}</Text>}
      </View>

      <View style={s.panel}>
        <Text style={s.h2}>{copy.protect.disclosureTitle}</Text>
        {copy.protect.disclosure.map((p) => (
          <Text key={p} style={s.text}>
            {p}
          </Text>
        ))}
      </View>

      <View style={s.panel}>
        <Text style={s.h2}>
          {copy.protect.stepAccess} · {on ? copy.protect.on : copy.protect.off}
        </Text>
        <Text style={s.quiet}>{copy.protect.stepAccessHint}</Text>
        <Button primary={!on} label={copy.protect.openAccess} onPress={() => engine.openAccessibilitySettings()} />
      </View>

      <View style={s.panel}>
        <Text style={s.h2}>
          {copy.protect.stepBattery} · {battery ? copy.protect.on : copy.protect.off}
        </Text>
        <Text style={s.quiet}>{copy.protect.stepBatteryHint}</Text>
        <Button label={copy.protect.openBattery} onPress={() => engine.openBatterySettings()} />
      </View>

      {needsAutostart && (
        <View style={s.panel}>
          <Text style={s.h2}>{copy.protect.stepAutostart}</Text>
          <Text style={s.quiet}>{copy.protect.stepAutostartHint(brand)}</Text>
          <Button label={copy.protect.openAutostart} onPress={() => setNote(engine.openAutostartSettings() ? null : copy.protect.autostartFallback)} />
          {note && <Text style={s.quiet}>{note}</Text>}
        </View>
      )}

      {/* M5b-5: optional, off by default, with its own disclosure before anything is switched on. */}
      <View style={s.panel}>
        <Text style={s.h2}>
          {copy.protect.webTitle} · {web.enabled ? copy.protect.on : copy.protect.off}
        </Text>
        {copy.protect.webDisclosure.map((p) => (
          <Text key={p} style={s.quiet}>
            {p}
          </Text>
        ))}
        <Text style={s.text}>
          {!web.enabled ? copy.protect.webOff : !web.allowed ? copy.protect.webNeedsAllow : web.running ? copy.protect.webRunning : copy.protect.webWaiting}
        </Text>
        {web.enabled && !web.allowed && (
          <>
            <Text style={s.quiet}>{copy.protect.webAllowHint}</Text>
            <Button
              primary
              label={copy.protect.webAllow}
              onPress={() => {
                engine.requestWebBlocking();
                setWeb(engine.webBlocking());
              }}
            />
          </>
        )}
        <Button
          label={web.enabled ? copy.protect.webSwitchOff : copy.protect.webSwitchOn}
          onPress={() => {
            const next = !web.enabled;
            engine.setWebBlocking(next);
            // Switching on leads straight to Android's own question, the first time.
            if (next) engine.requestWebBlocking();
            setWeb(engine.webBlocking());
          }}
        />
      </View>

      <Text style={s.quiet}>{copy.protect.honest}</Text>
    </ScrollView>
  );
}
