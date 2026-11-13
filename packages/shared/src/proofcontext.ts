import { copy } from "./copy";
import type { ProofContext } from "./types";

/**
 * Turns proof_context() into the short lines shown next to a proof (D32). Facts only, in a fixed
 * order, and never a score: a number would read as a verdict on the person. The "similar photo"
 * note has its own line in the interface already, so it is not repeated here.
 */
export function proofContextLines(c: ProofContext | null | undefined): string[] {
  if (!c) return [];
  const lines: string[] = [];
  const days = Math.max(0, Math.floor(Number(c.days_after) || 0));
  lines.push(days === 0 ? copy.proofContext.sameDay : copy.proofContext.later(days));
  if (c.soon_after_planning && days === 0) lines.push(copy.proofContext.soon);
  if (c.kind === "photo" && c.photo_age === "fresh") lines.push(copy.proofContext.photoFresh);
  if (c.kind === "photo" && c.photo_age === "older") lines.push(copy.proofContext.photoOlder);
  return lines;
}

/** Same rule as _circle_alias() in migration 0022. */
const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,18}[A-Za-z0-9]$/;

/** Tidies a circle name the way the database does. "" means "use my own name"; null means not allowed. */
export function normalizeCircleAlias(input: string): string | null {
  const a = input.trim().replace(/\s+/g, " ");
  if (a === "") return "";
  return ALIAS_RE.test(a) ? a : null;
}

export const CIRCLE_ALIAS_SOURCE = ALIAS_RE.source;
