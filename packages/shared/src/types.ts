export type ItemStatus = "pending" | "done" | "partial" | "missed" | "rescheduled";
export type StakeType = "none" | "points";
export type Mood = 1 | 2 | 3 | 4 | 5;

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  gentle_mode: boolean;
  onboarded: boolean;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  proof_required: boolean;
  archived: boolean;
  created_at: string;
}

export interface TaskStep {
  id: string;
  task_id: string;
  title: string;
  est_minutes: number;
  position: number;
  done_on: string | null;
}

export interface DailyPlan {
  id: string;
  user_id: string;
  date: string;
  committed_at: string | null;
  stake_type: StakeType;
  stake_amount: number;
  mood_morning: number | null;
  mood_evening: number | null;
  reviewed_at: string | null;
  points_earned: number | null;
}

export interface PlanItem {
  id: string;
  daily_plan_id: string;
  task_id: string;
  status: ItemStatus;
  completed_at: string | null;
}

export interface FocusSession {
  id: string;
  user_id: string;
  started_at: string;
  planned_minutes: number;
  ends_at: string;
  ended_at: string | null;
  ended_early: boolean;
}

export interface Device {
  id: string;
  user_id: string;
  platform: "web" | "extension" | "android";
  label: string | null;
  last_heartbeat_at: string | null;
  protection_enabled: boolean;
}
