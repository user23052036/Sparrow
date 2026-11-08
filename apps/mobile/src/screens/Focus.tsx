import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { copy } from "@sparrow/shared";
import { errorText, supabase } from "../supabase";
import { Button, Err } from "../ui";
import { s } from "../theme";
import { clock } from "../format";

interface FocusState { active: boolean; session_id: string | null; ends_at: string | null; server_now: string; domains: string[]; locked?: boolean }
const DURATIONS = [15, 25, 45, 60, 90];

export function Focus() {
  const [state, setState] = useState<FocusState | null>(null);
  const [skew, setSkew] = useState(0); // server time minus phone time
  const [now, setNow] = useState(Date.now());
  const [minutes, setMinutes] = useState(25);
  const [exiting, setExiting] = useState(false);
  const [wait, setWait] = useState(30);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_focus_state");
    if (!alive.current) return;
    if (error) { setErr(errorText(error)); return; }
    const st = data as FocusState;
    setErr(null); setState(st); setSkew(new Date(st.server_now).getTime() - Date.now());
    if (!st.active) setExiting(false);
  }, []);

  useEffect(() => { alive.current = true; void load(); const t = setInterval(load, 10000); return () => { alive.current = false; clearInterval(t); }; }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!exiting || wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [exiting, wait]);

  async function start() {
    const { error } = await supabase.rpc("start_focus_session", { p_minutes: minutes });
    if (error) setErr(errorText(error)); else void load();
  }
  async function end() {
    if (!state?.session_id) return;
    const { error } = await supabase.rpc("end_focus_session", { p_session_id: state.session_id, p_reason: reason });
    if (error) setErr(errorText(error)); else { setExiting(false); setReason(""); void load(); }
  }

  const left = state?.ends_at ? new Date(state.ends_at).getTime() - (now + skew) : 0;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Focus</Text>
      <Err>{err}</Err>
      {state?.active ? (
        <View style={s.panel}>
          <Text style={s.h2}>Focusing</Text>
          <Text style={{ fontSize: 44, fontWeight: "700", color: "#2b2a28" }}>{clock(left)}</Text>
          {state.locked ? (
            <Text style={s.quiet}>This session is locked. Only your partner can end it early; ask them in Sparrow on the website.</Text>
          ) : !exiting ? (
            <Button label="End early" onPress={() => { setWait(30); setExiting(true); }} />
          ) : wait > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={s.h2}>Take a breath first</Text>
              <Text style={s.text}>Wait {wait} seconds. If the urge passes, you can just go back to your session.</Text>
              <Button primary label="Keep focusing" onPress={() => setExiting(false)} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={s.text}>{copy.earlyExitPrompt}</Text>
              <TextInput style={s.input} value={reason} onChangeText={setReason} maxLength={300} />
              <View style={s.row}>
                <Button primary label="Keep focusing" onPress={() => setExiting(false)} />
                <Button label="End session" disabled={reason.trim().length < 3} onPress={end} />
              </View>
              <Text style={s.quiet}>Ending early is noted in your history, just so you can see your patterns.</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={s.panel}>
          <Text style={s.h2}>Start a session</Text>
          <View style={s.row}>{DURATIONS.map((d) => <Button key={d} label={`${d} min`} on={minutes === d} onPress={() => setMinutes(d)} />)}</View>
          <Button primary label="Start focusing" onPress={start} />
        </View>
      )}
      <View style={s.note}>
        <Text style={s.quiet}>Blocking apps on this phone is coming next. For now, sessions you start here block sites in your browser extension, and the timer stays in sync.</Text>
      </View>
    </ScrollView>
  );
}
