export const IF_THEN_MAX = 120;

export interface IfThen {
  if_cue?: string | null;
  then_action?: string | null;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Cleans what the user typed into the two boxes. Both parts are needed, otherwise the plan is
 * cleared (the database stores them as a pair). Leading "If" / "then I will" are dropped so the
 * sentence never reads "If if …".
 */
export function cleanIfThen(cue: string, action: string): IfThen {
  const c = squash(cue)
    .replace(/^if(\s+|$)/i, "")
    .replace(/[.,;:!]+$/, "")
    .slice(0, IF_THEN_MAX)
    .trim();
  const a = squash(action)
    .replace(/^then(\s+|$)/i, "")
    .replace(/^i(\s+will|'ll)(\s+|$)/i, "")
    .replace(/[.,;:!]+$/, "")
    .slice(0, IF_THEN_MAX)
    .trim();
  return c && a ? { if_cue: c, then_action: a } : { if_cue: null, then_action: null };
}

/** The sentence shown to the user, or null when the task has no plan. */
export function ifThenLine(t: IfThen): string | null {
  if (!t.if_cue || !t.then_action) return null;
  return `If ${t.if_cue}, then I will ${t.then_action}.`;
}
