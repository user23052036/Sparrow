import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { copy, keyHolderName, type DailyPlan, type ItemStatus, type PartnerOverview, type PlanItem, type Task } from "@sparrow/shared";
import { errorText, supabase } from "../supabase";
import { Button, Err } from "../ui";
import { ProofCapture } from "../ProofCapture";
import { Review } from "../Review";
import { s } from "../theme";

export function Today({ name, userId }: { name: string | null; userId: string }) {
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [proofs, setProofs] = useState<Record<string, number>>({});
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    const t = await supabase.rpc("get_today");
    if (t.error) {
      setErr(errorText(t.error));
      setBusy(false);
      return;
    }
    const p = t.data as DailyPlan;
    const [it, tk, pr, po] = await Promise.all([
      supabase.from("plan_items").select("*").eq("daily_plan_id", p.id),
      supabase.from("tasks").select("*").eq("archived", false),
      supabase.from("proofs").select("plan_item_id"),
      supabase.rpc("partner_overview"),
    ]);
    setBusy(false);
    if (it.error || tk.error || pr.error) {
      setErr(errorText(it.error ?? tk.error ?? pr.error));
      return;
    }
    const counts: Record<string, number> = {};
    for (const r of (pr.data ?? []) as { plan_item_id: string }[]) counts[r.plan_item_id] = (counts[r.plan_item_id] ?? 0) + 1;
    setErr(null);
    setPlan(p);
    setItems((it.data ?? []) as PlanItem[]);
    setTasks((tk.data ?? []) as Task[]);
    setProofs(counts);
    setPartnerName(keyHolderName((po.data as PartnerOverview | null) ?? null));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function mark(id: string, status: ItemStatus) {
    const { error } = await supabase.rpc("set_item_status", { p_item_id: id, p_status: status });
    if (error) setErr(errorText(error));
    else void load();
  }

  const open = plan?.committed_at && !plan.reviewed_at;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
      <Text style={s.h1}>{copy.today.title(name ? `, ${name}` : "")}</Text>
      <Err>{err}</Err>
      {note && (
        <View style={s.note} accessibilityLiveRegion="polite">
          <Text style={s.text}>{note}</Text>
        </View>
      )}
      {plan && !plan.committed_at && (
        <View style={s.panel}>
          <Text style={s.h2}>{copy.phoneToday.goodMorning}</Text>
          <Text style={s.text}>
            {copy.phoneToday.notPlanned} {copy.morningPrompt}
          </Text>
          <Text style={s.quiet}>{copy.phoneToday.planOnWebsite}</Text>
        </View>
      )}
      {open && reviewing && (
        <Review
          plan={plan}
          items={items}
          tasks={tasks}
          onDone={(msg) => {
            setReviewing(false);
            setNote(msg);
            void load();
          }}
        />
      )}
      {open &&
        !reviewing &&
        items.map((i) => (
          <View key={i.id} style={s.panel}>
            <View style={s.spread}>
              <Text style={[s.h2, { flex: 1 }]}>{tasks.find((t) => t.id === i.task_id)?.title ?? "Task"}</Text>
              <Text style={s.quiet}>{copy.phoneToday.status[i.status]}</Text>
            </View>
            <View style={s.row}>
              <Button label={copy.phoneToday.markDone} on={i.status === "done"} onPress={() => mark(i.id, "done")} />
              <Button label={copy.phoneToday.markPartly} on={i.status === "partial"} onPress={() => mark(i.id, "partial")} />
            </View>
            {(proofs[i.id] ?? 0) > 0 && <Text style={s.quiet}>{copy.today.proofsSaved(proofs[i.id])}</Text>}
            <ProofCapture
              itemId={i.id}
              userId={userId}
              partnerName={partnerName}
              onSaved={(msg) => {
                setNote(msg);
                void load();
              }}
            />
          </View>
        ))}
      {open && !reviewing && (
        <View style={s.panel}>
          <Text style={s.quiet}>{copy.phoneToday.reviewHint}</Text>
          <Button label={copy.today.reviewMyDay} primary onPress={() => setReviewing(true)} />
        </View>
      )}
      {plan?.reviewed_at && (
        <View style={s.panel}>
          <Text style={s.h2}>{copy.today.closedTitle}</Text>
          <Text style={s.text}>{copy.today.closedBody(plan.points_earned ?? 0)}</Text>
        </View>
      )}
    </ScrollView>
  );
}
