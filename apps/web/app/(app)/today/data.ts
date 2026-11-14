import { isHeavyStretch, type Charity, type DailyPlan, type MakeupStep, type Pledge, type PlanItem, type Task, type TaskStep } from "@sparrow/shared";
import { supabase } from "@/lib/supabase";

export interface Data {
  plan: DailyPlan;
  unreviewed: DailyPlan[];
  tasks: Task[];
  items: PlanItem[];
  steps: TaskStep[];
  proofCounts: Record<string, number>;
  balance: number;
  heavyStretch: boolean;
  verdicts: Record<string, { verdict: string; comment: string | null }>;
  partnerName: string | null;
  /** Plans (days) that already have a kind act. */
  kindActs: string[];
  charities: Charity[];
  pledges: Pledge[];
  /** Reviewed days, newest first, for the suggested number of tasks. */
  recentPlans: { id: string; date: string; reviewed_at: string | null }[];
  makeups: MakeupStep[];
}

export async function loadData(): Promise<Data> {
  const sb = supabase();
  const today = await sb.rpc("get_today");
  if (today.error) throw today.error;
  const plan = today.data as DailyPlan;
  const [unrev, tasks, items, steps, proofs, bal, recent, vers, po, kind, chars, pledges, past, makeups] = await Promise.all([
    sb.rpc("unreviewed_days"),
    sb.from("tasks").select("*").eq("archived", false).order("created_at"),
    sb.from("plan_items").select("*"),
    sb.from("task_steps").select("*").order("position"),
    sb.from("proofs").select("id, plan_item_id"),
    sb.rpc("points_balance"),
    sb.rpc("recent_completion", { p_days: 3 }),
    sb.from("verifications").select("proof_id, verdict, comment, created_at").order("created_at"),
    sb.rpc("partner_overview"),
    sb.from("kind_acts").select("plan_id"),
    sb.from("charities").select("id, name, blurb").order("name"),
    sb.from("pledges").select("id, plan_id, charity_id, amount, mode, status, owed"),
    sb.from("daily_plans").select("id, date, reviewed_at").not("reviewed_at", "is", null).order("date", { ascending: false }).limit(7),
    sb.from("makeup_steps").select("id, from_plan_id, due_on, title, status").order("due_on"),
  ]);
  for (const r of [unrev, tasks, items, steps, proofs, bal, recent]) if (r.error) throw r.error;
  const proofCounts: Record<string, number> = {};
  const itemOfProof: Record<string, string> = {};
  for (const p of (proofs.data ?? []) as { id: string; plan_item_id: string }[]) {
    proofCounts[p.plan_item_id] = (proofCounts[p.plan_item_id] ?? 0) + 1;
    itemOfProof[p.id] = p.plan_item_id;
  }
  const verdicts: Data["verdicts"] = {};
  for (const v of (vers.data ?? []) as { proof_id: string; verdict: string; comment: string | null }[]) {
    const item = itemOfProof[v.proof_id];
    if (item) verdicts[item] = { verdict: v.verdict, comment: v.comment };
  }
  const ov = po.data as { state?: string; partner?: { name: string } } | null;
  const rc = (recent.data ?? []) as { date: string; completion: number }[];
  return {
    plan,
    unreviewed: (unrev.data ?? []) as DailyPlan[],
    tasks: (tasks.data ?? []) as Task[],
    items: (items.data ?? []) as PlanItem[],
    steps: (steps.data ?? []) as TaskStep[],
    proofCounts,
    balance: (bal.data as number) ?? 0,
    heavyStretch: isHeavyStretch(rc),
    verdicts,
    partnerName: ov?.state === "active" ? (ov.partner?.name ?? null) : null,
    kindActs: ((kind.data ?? []) as { plan_id: string }[]).map((k) => k.plan_id),
    charities: (chars.data ?? []) as Charity[],
    pledges: (pledges.data ?? []) as Pledge[],
    recentPlans: ((past.data ?? []) as Data["recentPlans"]).filter((p) => p.reviewed_at),
    makeups: (makeups.data ?? []) as MakeupStep[],
  };
}
