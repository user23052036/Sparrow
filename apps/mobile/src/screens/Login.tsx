import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { errorText, supabase } from "../supabase";
import { Button, Err } from "../ui";
import { s } from "../theme";

export function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const creds = { email: email.trim(), password };
    const { error } = mode === "in" ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds);
    setBusy(false);
    if (error) setErr(errorText(error));
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.body, { paddingTop: 72 }]} keyboardShouldPersistTaps="handled">
      <StatusBar style="dark" />
      <Text style={s.h1}>Sparrow</Text>
      <Text style={s.quiet}>A gentle daily accountability app. Sign in with the account you use on the website.</Text>
      <View style={s.panel}>
        <Text style={s.text}>Email</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Text style={s.text}>Password</Text>
        <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
        <Button
          primary
          disabled={busy || !email || password.length < (mode === "up" ? 8 : 1)}
          label={mode === "in" ? "Sign in" : "Create account"}
          onPress={submit}
        />
        <Err>{err}</Err>
        <Button label={mode === "in" ? "I need an account" : "I already have an account"} onPress={() => setMode(mode === "in" ? "up" : "in")} />
        {mode === "up" && <Text style={s.quiet}>Use at least 8 characters. After signing up, finish your name and time zone on the website.</Text>}
      </View>
    </ScrollView>
  );
}
