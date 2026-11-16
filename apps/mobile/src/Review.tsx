import { useState } from "react";
import { Text, View } from "react-native";
import { copy, reviewMessage, reviewStartStatuses, type DailyPlan, type ItemStatus, type PlanItem, type ReviewResult, type Task } from "@sparrow/shared";
import { errorText, supabase } from "./supabase";
import { Button, Err } from "./ui";
import { s } from "./theme";

const OPTIONS = ["done", "partial", "missed", "rescheduled"] as const;
const MOODS = copy.moods.map((label, i) => ({ value: i + 1, label }));

/** The evening review on the phone (ROADMAP T3.1): the same review_day() the website calls. */
export function Review({
  plan,
  items,
  tasks,
  onDone,
  onClose,
}: {
  plan: DailyPlan;
  items: PlanItem[];
  tasks: Task[];
  onDone: (msg: string) => void;
  /** Back to the list, also after the day was closed somewhere else. */
  onClose: () => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>(() => reviewStartStatuses(items));
  const [mood, setMood] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("review_day", { p_plan_id: plan.id, p_statuses: statuses, p_mood: mood });
    setBusy(false);
    if (error && /already reviewed/i.test(error.message)) onClose();
    else if (error) setErr(errorText(error));
    else onDone(reviewMessage(data as ReviewResult, true));
  }

  return (
    <View style={s.panel}>
      <Text style={s.h2}>{copy.today.reviewTitle}</Text>
      <Text style={s.quiet}>{copy.eveningPrompt}</Text>
      {items.map((i) => (
        <View key={i.id} style={{ gap: 6 }}>
          <Text style={s.text}>{tasks.find((t) => t.id === i.task_id)?.title ?? "Task"}</Text>
          <View style={s.row}>
            {OPTIONS.map((o) => (
              <Button key={o} label={copy.today.reviewOptions[o]} on={statuses[i.id] === o} onPress={() => setStatuses((st) => ({ ...st, [i.id]: o }))} />
            ))}
          </View>
        </View>
      ))}
      <Text style={s.text}>{copy.today.leavingMood}</Text>
      <View style={s.row} accessibilityRole="radiogroup">
        {MOODS.map((m) => (
          <Button key={m.value} label={m.label} on={mood === m.value} onPress={() => setMood(m.value)} />
        ))}
      </View>
      <View style={s.row}>
        <Button label={copy.today.finishDay} primary disabled={busy} onPress={finish} />
        <Button label={copy.phoneToday.notNow} disabled={busy} onPress={onClose} />
      </View>
      <Err>{err}</Err>
    </View>
  );
}
