import { useCallback, useEffect, useState } from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { copy, isAutostartBrand, setupLines, setupReady, type SetupFacts, type SetupLine, type SetupState } from "@sparrow/shared";
import { engine, isNativeAvailable } from "../../modules/sparrow-blocker/src";
import { errorText, notifyMyExtensions, supabase } from "../supabase";
import { SETUP_TEST_KEY } from "../device";
import { Button, Err } from "../ui";
import { c, s } from "../theme";

/** The live test survives a trip to another app (to see the blocked screen) and back; it belongs to one account. */
type Test = SetupFacts["test"];
type StoredTest = { userId: string; startedMs: number; reachedPhone: boolean };
const NO_TEST: Test = { startedMs: null, reachedPhone: false, lastCoverMs: 0 };

async function storedTest(userId: string | null): Promise<Test> {
  try {
    const t = JSON.parse((await AsyncStorage.getItem(SETUP_TEST_KEY)) ?? "null") as StoredTest | null;
    return t && userId && t.userId === userId ? { startedMs: t.startedMs, reachedPhone: t.reachedPhone, lastCoverMs: 0 } : NO_TEST;
  } catch {
    return NO_TEST;
  }
}

const COLOR: Record<SetupState, string> = { pass: c.accent, notYet: c.error, byHand: c.ink, optional: c.quiet };

/** Everything "Check my setup" needs to know, read fresh each time (T3.3). */
async function gatherFacts(test: Test, user: Awaited<ReturnType<typeof supabase.auth.getUser>>): Promise<SetupFacts> {
  const st = engine.state();
  const device = engine.configuredDeviceId();
  const [list, row] = await Promise.all([
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
    // The background service's own check-ins: opening this screen also checks in, which proves nothing about it.
    lastSyncMs: st?.serviceSyncMs ?? 0,
    batteryOk: engine.batteryOk(),
    autostartBrand: isAutostartBrand(engine.manufacturer()),
    listedApps: ((list.data as { android_packages: string[] | null } | null)?.android_packages ?? []).length,
    // The server's clock moved onto the phone's, with the offset from the last check-in.
    server: server?.last_heartbeat_at
      ? { lastHeartbeatMs: Date.parse(server.last_heartbeat_at) - (st?.serverOffsetMs ?? 0), protection: server.protection_enabled }
      : null,
    notificationsOn: engine.notificationsOn(),
    test: { ...test, lastCoverMs: st?.lastCoverMs ?? 0 },
    web: engine.webBlocking(),
  };
}

/** "Check my setup" (ROADMAP T3.3): the BETA.md phone checklist, each line done or not yet. */
export function SetupCheck({ onBack }: { onBack: () => void }) {
  const [lines, setLines] = useState<SetupLine[] | null>(null);
  const [test, setTest] = useState<Test>(NO_TEST);
  const [userId, setUserId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(async (t?: Test) => {
    const user = await supabase.auth.getUser();
    const id = user.data.user?.id ?? null;
    const current = t ?? (await storedTest(id));
    setUserId(id);
    setTest(current);
    setLines(setupLines(await gatherFacts(current, user)));
  }, []);

  useEffect(() => {
    void check();
    // Back from the blocked screen, Settings or another app: check again.
    const sub = AppState.addEventListener("change", (st) => st === "active" && void check());
    return () => sub.remove();
  }, [check]);

  async function saveTest(t: Test) {
    if (userId && t.startedMs !== null) {
      const stored: StoredTest = { userId, startedMs: t.startedMs, reachedPhone: t.reachedPhone };
      await AsyncStorage.setItem(SETUP_TEST_KEY, JSON.stringify(stored));
    }
    await check(t);
  }

  async function startTest() {
    setErr(null);
    setTesting(true);
    try {
      const startedMs = Date.now();
      // Ask the server first: the phone's copy may be behind (a session from the laptop, or one that ended).
      const first = await engine.syncNow();
      if (!first?.ok) throw new Error(copy.setupCheck.testNeedsNetwork);
      const running = first.active;
      if (!running) {
        const { data, error } = await supabase.rpc("start_focus_session", { p_minutes: 5 });
        // Started elsewhere a moment ago: test that one.
        if (error && !/already running/i.test(error.message)) throw error;
        if (!error) notifyMyExtensions("session_started", (data as { id?: string } | null)?.id);
      }
      await saveTest({ startedMs, reachedPhone: false, lastCoverMs: 0 });
      // The engine checks in every 30 s; asking it directly makes this a few seconds.
      for (let i = 0; i < 12; i++) {
        const r = await engine.syncNow();
        if (r?.ok && r.active) {
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
  const passed = (id: SetupLine["id"]) => lines?.find((l) => l.id === id)?.state === "pass";
  const apps = passed("apps");
  // A test while blocking is off would only make a session that nothing on this phone enforces.
  const blocking = passed("access") && passed("engine");
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
          <View
            key={l.id}
            style={s.panel}
            accessible
            accessibilityLabel={`${words.title}: ${copy.setupCheck.states[l.state]}`}
            accessibilityHint={l.state === "pass" ? undefined : words.todo}
          >
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
        {!blocking && <Text style={s.quiet}>{copy.setupCheck.testNeedsBlocking}</Text>}
        {!apps && <Text style={s.quiet}>{copy.setupCheck.testNeedsApps}</Text>}
        <Button label={copy.setupCheck.testStart} primary disabled={testing || !apps || !blocking} onPress={startTest} />
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
