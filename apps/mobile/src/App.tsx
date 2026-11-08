import { useEffect, useState } from "react";
import { AppState, Pressable, SafeAreaView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { copy, type Profile } from "@sparrow/shared";
import { isConfigured, supabase } from "./supabase";
import { forgetEngine, setUpEngine } from "./device";
import { Login } from "./screens/Login";
import { Today } from "./screens/Today";
import { Focus } from "./screens/Focus";
import { Apps } from "./screens/Apps";
import { Protect } from "./screens/Protect";
import { Button } from "./ui";
import { s } from "./theme";

type Tab = "today" | "focus" | "apps" | "protect" | "account";
const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "focus", label: "Focus" },
  { id: "apps", label: "Apps" },
  { id: "protect", label: copy.protect.tab },
  { id: "account", label: "Account" },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile) ?? null));
    // Once blocking is switched on, keep the engine's credential and state fresh whenever the app opens.
    void setUpEngine();
    const sub = AppState.addEventListener("change", (st) => st === "active" && void setUpEngine());
    return () => sub.remove();
  }, [session]);

  if (!isConfigured) {
    return (
      <SafeAreaView style={[s.screen, { padding: 24, justifyContent: "center" }]}>
        <Text style={s.h1}>Almost there</Text>
        <Text style={s.text}>Copy apps/mobile/.env.example to .env and add your Supabase URL and anon key, then restart.</Text>
      </SafeAreaView>
    );
  }
  if (!ready)
    return (
      <SafeAreaView style={s.screen}>
        <Text style={[s.quiet, { padding: 24 }]}>Loading…</Text>
      </SafeAreaView>
    );
  if (!session) return <Login />;

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {tab === "today" && <Today name={profile?.display_name ?? null} />}
        {tab === "focus" && <Focus />}
        {tab === "apps" && <Apps userId={session.user.id} />}
        {tab === "protect" && <Protect />}
        {tab === "account" && (
          <View style={[s.body, { flex: 1 }]}>
            <Text style={s.h1}>Account</Text>
            <View style={s.panel}>
              <Text style={s.text}>{session.user.email}</Text>
              <Button
                label="Sign out"
                onPress={async () => {
                  await forgetEngine();
                  await supabase.auth.signOut();
                }}
              />
            </View>
            <View style={s.panel}>
              <Text style={s.h2}>{copy.helpTitle}</Text>
              <Text style={s.text}>{copy.helpIntro} To find a helpline, visit findahelpline.com.</Text>
            </View>
          </View>
        )}
      </View>
      <View style={s.tabs} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable key={t.id} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} onPress={() => setTab(t.id)}>
            <Text style={[s.tabText, tab === t.id && s.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
