import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { normalizePackageList, isValidPackageName } from "@sparrow/shared";
import { getInstalledApps, isNativeAvailable, type InstalledApp } from "../../modules/sparrow-blocker/src";
import { errorText, supabase } from "../supabase";
import { Button, Err } from "../ui";
import { s } from "../theme";

export function Apps({ userId }: { userId: string }) {
  const [saved, setSaved] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setInstalled(getInstalledApps());
    supabase.from("blocklists").select("android_packages").eq("user_id", userId).maybeSingle().then(({ data, error }) => {
      if (error) { setErr(errorText(error)); return; }
      const list = ((data as { android_packages: string[] } | null)?.android_packages ?? []);
      setSaved(list); setPicked(list);
    });
  }, [userId]);

  const dirty = useMemo(() => JSON.stringify([...picked].sort()) !== JSON.stringify([...saved].sort()), [picked, saved]);
  const labelOf = (p: string) => installed.find((a) => a.packageName === p)?.label ?? p;
  const shown = installed.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));
  const toggle = (p: string) => setPicked((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));

  async function save() {
    setMsg(null); setErr(null);
    const list = normalizePackageList(picked);
    const { error } = await supabase.from("blocklists").update({ android_packages: list, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) { setErr(errorText(error)); return; }
    setSaved(list); setPicked(list); setMsg("Saved.");
  }
  function addManual() {
    const p = manual.trim();
    if (!isValidPackageName(p)) { setErr("That doesn't look like an app id, like com.instagram.android."); return; }
    setErr(null); setManual(""); setPicked((x) => (x.includes(p) ? x : [...x, p]));
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Apps to keep away</Text>
      <Text style={s.quiet}>You choose what Sparrow keeps away during focus time. Phone, messages and emergency apps are never blocked.</Text>
      <Err>{err}</Err>
      {msg && <View style={s.note}><Text style={s.text}>{msg}</Text></View>}
      <View style={s.panel}>
        <Text style={s.h2}>Your list ({picked.length})</Text>
        {picked.length === 0 && <Text style={s.quiet}>Nothing yet.</Text>}
        <View style={s.row}>{picked.map((p) => <Button key={p} on label={`${labelOf(p)} ✕`} onPress={() => toggle(p)} />)}</View>
        <Button primary label="Save list" disabled={!dirty} onPress={save} />
      </View>
      {isNativeAvailable ? (
        <View style={s.panel}>
          <Text style={s.h2}>Installed apps</Text>
          <TextInput style={s.input} placeholder="Search" value={query} onChangeText={setQuery} />
          <View style={s.row}>{shown.map((a) => <Button key={a.packageName} label={a.label} on={picked.includes(a.packageName)} onPress={() => toggle(a.packageName)} />)}</View>
        </View>
      ) : (
        <View style={s.panel}>
          <Text style={s.h2}>Add an app by its id</Text>
          <Text style={s.quiet}>The installed-apps picker needs the Sparrow development build. You can still add apps by id, like com.instagram.android.</Text>
          <TextInput style={s.input} value={manual} onChangeText={setManual} autoCapitalize="none" autoCorrect={false} placeholder="com.example.app" />
          <Button label="Add" onPress={addManual} />
        </View>
      )}
    </ScrollView>
  );
}
