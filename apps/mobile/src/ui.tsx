import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { s } from "./theme";

export function Button({ label, onPress, primary, on, disabled }: {
  label: string; onPress: () => void; primary?: boolean; on?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={onPress}
      style={[s.btn, on && s.btnOn, primary && s.btnPrimary, disabled && { opacity: 0.5 }]}>
      <Text style={[s.btnText, primary && s.btnPrimaryText]}>{label}</Text>
    </Pressable>
  );
}

export function Err({ children }: { children: ReactNode }) {
  return children ? <Text accessibilityRole="alert" style={s.error}>{children}</Text> : null;
}
