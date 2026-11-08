import { StyleSheet } from "react-native";

export const c = { bg: "#faf7f2", panel: "#ffffff", ink: "#2b2a28", quiet: "#6f6a62", line: "#e6e0d6", accent: "#3f7d6b", note: "#eef5f1", error: "#a34a3b" };

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  body: { padding: 16, gap: 12 },
  h1: { fontSize: 24, fontWeight: "700", color: c.ink },
  h2: { fontSize: 18, fontWeight: "700", color: c.ink },
  text: { fontSize: 16, color: c.ink },
  quiet: { fontSize: 14, color: c.quiet },
  panel: { backgroundColor: c.panel, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 14, gap: 10 },
  note: { backgroundColor: c.note, borderRadius: 12, padding: 12 },
  error: { color: c.error, fontSize: 14 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  spread: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 10, fontSize: 16, color: c.ink, backgroundColor: "#fff" },
  btn: { borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#fff" },
  btnOn: { borderColor: c.accent, backgroundColor: c.note },
  btnPrimary: { backgroundColor: c.accent, borderColor: c.accent },
  btnText: { fontSize: 15, color: c.ink, fontWeight: "600" },
  btnPrimaryText: { color: "#fff" },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderColor: c.line, backgroundColor: c.panel },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText: { fontSize: 14, color: c.quiet },
  tabTextOn: { color: c.accent, fontWeight: "700" },
});
