import { useCallback, useEffect, useState } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { copy, isAutostartBrand, setupLines, setupReady, type SetupFacts, type SetupLine, type SetupState } from "@sparrow/shared";
import { engine, isNativeAvailable } from "../../modules/sparrow-blocker/src";
import { errorText, notifyMyExtensions, supabase } from "../supabase";
import { Button, Err } from "../ui";
import { c, s } from "../theme";

/** The live test survives a trip to another app (to see the blocked screen) and back. */
const TEST = "sparrow:setupTest";
type Test = SetupFacts["test"];
const NO_TEST: Test = { startedMs: null, reachedPhone: false, lastCoverMs: 0 };

const COLOR: Record<SetupState, string> = { pass: c.accent, notYet: c.error, byHand: c.ink, optional: c.quiet };

/** Everything "Check my setup" needs to know, read fresh each time (T3.3). */
async function gatherFacts(test: Test): Promise<SetupFacts> {
  const st = engine.state();
  const device = engine.configuredDeviceId();
  const [user, list, row] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("blocklists").select("android_packages").maybeSingle(),
    device ? supabase.from("devices").select("last_heartbeat_at, protection_enabled").eq("id", device).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const server = row.data as { last_heartbeat_at: string | null; protection_enabled: boolean } | null;
  return {
    now: Date.now(),
    nativeBuild: isNativeAvailable,
    accountOk: !user.error && !!user.data.user,
    accessibilityOn: engine.protectionOn(),
    engineConfigured: !!st?.configured,
    engineSignedOut: st?.status === "signed_out",
    lastSyncMs: st?.lastSyncMs ?? 0,
    batteryOk: engine.batteryOk(),
    autostartBrand: isAutostartBrand(engine.manufacturer()),
    listedApps: ((list.data as { android_packages: string[] | null } | null)?.android_packages ?? []).length,
    server: server?.last_heartbeat_at ? { lastHeartbeatMs: Date.parse(server.last_heartbeat_at), protection: server.protection_enabled } : null,
    notificationsOn: engine.notificationsOn(),
    test: { ...test, lastCoverMs: st?.lastCoverMs ?? 0 },
    web: engine.webBlocking(),
  };
}

/** "Check my setup" (ROADMAP T3.3): the BETA.md phone checklist, each line done or not yet. */
export function SetupCheck({ onBack }: { onBack: () => void }) {
  const [lines, setLines] = useState<SetupLine[] | null>(null);
  const [test, setTest] = useState<Test>(NO_TEST);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(async (t?: Test) => {
    const current = t ?? (JSON.parse((await AsyncStorage.getItem(TEST)) ?? "null") as Test | null) ?? NO_TEST;
    setTest(current);
    setLines(setupLines(await gatherFacts(current)));
  }, []);

  useEffect(() => {
    void check();
    // Back from the blocked screen, Settings or another app: check again.
    const sub = AppState.addEventListener("change", (st) => st === "active" && void check());
    return () => sub.remove();
  }, [check]);

  async function saveTest(t: Test) {
    await AsyncStorage.setItem(TEST, JSON.stringify(t));
    await check(t);
  }

  async function startTest() {
    setErr(null);
    setTesting(true);
    try {
      const startedMs = Date.now();
      const running = engine.state()?.active;
      if (!running) {
        const { data, error } = await supabase.rpc("start_focus_session", { p_minutes: 5 });
        if (error) throw error;
        notifyMyExtensions("session_started", (data as { id?: string } | null)?.id);
      }
      await saveTest({ startedMs, reachedPhone: false, lastCoverMs: 0 });
      // The engine checks in every 30 s; asking it directly makes this a few seconds.
      for (let i = 0; i < 12; i++) {
        const r = await engine.syncNow();
        if (r?.active) {
          await saveTest({ startedMs, reachedPhone: true, lastCoverMs: 0 });
          return;
        }
        await new Promise((ok) => setTimeout(ok, 3000));
      }
      await check();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setTesting(false);
    }
  }

  const todo = lines?.filter((l) => l.state === "notYet").length ?? 0;
  const apps = lines?.find((l) => l.id === "apps")?.state === "pass";
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body}>
      <Text style={s.h1}>{copy.setupCheck.title}</Text>
      <Text style={s.quiet}>{copy.setupCheck.intro}</Text>
      {lines && (
        <View style={s.note} accessibilityLiveRegion="polite">
          <Text style={s.text}>{setupReady(lines) ? copy.setupCheck.ready : copy.setupCheck.notReady(todo)}</Text>
        </View>
      )}
      {lines?.map((l) => {
        const words = copy.setupCheck.lines[l.id];
        return (
          <View key={l.id} style={s.panel} accessibilityLabel={`${words.title}: ${copy.setupCheck.states[l.state]}`}>
            <View style={s.spread}>
              <Text style={[s.text, { flex: 1 }]}>{words.title}</Text>
              <Text style={[s.quiet, { color: COLOR[l.state], fontWeight: "700" }]}>{copy.setupCheck.states[l.state]}</Text>
            </View>
            {l.state !== "pass" && <Text style={s.quiet}>{words.todo}</Text>}
          </View>
        );
      })}
      <View style={s.panel}>
        <Text style={s.h2}>{copy.setupCheck.testTitle}</Text>
        {testing ? (
          <Text style={s.text}>{copy.setupCheck.testWaiting}</Text>
        ) : test.reachedPhone ? (
          <Text style={s.text}>{copy.setupCheck.testRunning}</Text>
        ) : null}
        {!apps && <Text style={s.quiet}>{copy.setupCheck.testNeedsApps}</Text>}
        <Button label={copy.setupCheck.testStart} primary disabled={testing || !apps} onPress={startTest} />
        <Text style={s.quiet}>{copy.setupCheck.testEnds}</Text>
        <Err>{err}</Err>
      </View>
      <View style={s.row}>
        <Button label={copy.setupCheck.again} onPress={() => void check()} />
        <Button label={copy.setupCheck.back} onPress={onBack} />
      </View>
    </ScrollView>
  );
}
