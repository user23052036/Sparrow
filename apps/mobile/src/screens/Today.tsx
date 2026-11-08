import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { copy, type DailyPlan, type ItemStatus, type PlanItem, type Task } from "@sparrow/shared";
import { errorText, supabase } from "../supabase";
import { Button, Err } from "../ui";
import { s } from "../theme";

const LABEL: Record<ItemStatus, string> = { pending: "Not yet", done: "Done", partial: "Partly done", missed: "Didn't happen", rescheduled: "Moved" };

export function Today({ name }: { name: string | null }) {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const t = await supabase.rpc("get_today");
    if (t.error) { setErr(errorText(t.error)); setBusy(false); return; }
    const p = t.data as DailyPlan;
    const [it, tk] = await Promise.all([
      supabase.from("plan_items").select("*").eq("daily_plan_id", p.id),
      supabase.from("tasks").select("*").eq("archived", false),
    ]);
    setBusy(false);
    if (it.error || tk.error) { setErr(errorText(it.error ?? tk.error)); return; }
    setErr(null); setPlan(p); setItems((it.data ?? []) as PlanItem[]); setTasks((tk.data ?? []) as Task[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function mark(id: string, status: ItemStatus) {
    const { error } = await supabase.rpc("set_item_status", { p_item_id: id, p_status: status });
    if (error) setErr(errorText(error)); else void load();
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
      <Text style={s.h1}>Today{name ? `, ${name}` : ""}</Text>
      <Err>{err}</Err>
      {plan && !plan.committed_at && (
        <View style={s.panel}>
          <Text style={s.h2}>Good morning</Text>
          <Text style={s.text}>You haven't planned today yet. {copy.morningPrompt}</Text>
          <Text style={s.quiet}>Planning your morning happens on the website for now. Your plan shows up here once it's set.</Text>
        </View>
      )}
      {plan?.committed_at && !plan.reviewed_at && items.map((i) => {
        const task = tasks.find((t) => t.id === i.task_id);
        return (
          <View key={i.id} style={s.panel}>
            <View style={s.spread}><Text style={[s.h2, { flex: 1 }]}>{task?.title ?? "Task"}</Text><Text style={s.quiet}>{LABEL[i.status]}</Text></View>
            <View style={s.row}>
              <Button label="Done" on={i.status === "done"} onPress={() => mark(i.id, "done")} />
              <Button label="Partly" on={i.status === "partial"} onPress={() => mark(i.id, "partial")} />
            </View>
          </View>
        );
      })}
      {plan?.reviewed_at && (
        <View style={s.panel}>
          <Text style={s.h2}>Today is closed</Text>
          <Text style={s.text}>You earned {plan.points_earned ?? 0} points today. Rest well. Tomorrow starts fresh.</Text>
        </View>
      )}
      {plan?.committed_at && !plan.reviewed_at && <Text style={s.quiet}>Photo proof and the evening review are on the website for now.</Text>}
    </ScrollView>
  );
}
