import { BADGE_KEYS, type BadgeKey } from "./progress";

/**
 * Badge crafting (D36, migration 0025): a crafted badge is made from badges already held.
 * Ingredients are never used up. Mirrors public._craft_recipe(); a test pins the two together.
 */
export const CRAFTED_KEYS = ["steady_hands", "honest_work", "warm_heart", "full_nest"] as const;
export type CraftedKey = (typeof CRAFTED_KEYS)[number];
export type AnyBadgeKey = BadgeKey | CraftedKey;

export const CRAFT_RECIPES: Record<CraftedKey, readonly AnyBadgeKey[]> = {
  steady_hands: ["first_plan", "first_full_day", "run_3"],
  honest_work: ["first_proof", "first_focus"],
  warm_heart: ["first_kind_act", "helped_partner"],
  full_nest: ["run_7", "steady_hands", "honest_work", "warm_heart"],
};

/** What my_collection() and craft_badge() answer. */
export interface Collection {
  crafted: string[];
  ready: string[];
}

export type CraftState = "crafted" | "ready" | "waiting";

export interface CraftRow {
  key: CraftedKey;
  state: CraftState;
  /** Each ingredient and whether the person holds it. */
  parts: { key: AnyBadgeKey; held: boolean }[];
}

export function isCraftedKey(k: string): k is CraftedKey {
  return (CRAFTED_KEYS as readonly string[]).includes(k);
}

/**
 * The collection as the Progress page shows it. "ready" comes from the server (it decides);
 * the per-ingredient ticks are worked out here from the earned and crafted lists.
 */
export function craftRows(earned: string[], collection: Collection): CraftRow[] {
  const held = new Set<string>([...earned.filter((k) => (BADGE_KEYS as readonly string[]).includes(k)), ...collection.crafted.filter(isCraftedKey)]);
  return CRAFTED_KEYS.map((key) => ({
    key,
    state: collection.crafted.includes(key) ? "crafted" : collection.ready.includes(key) ? "ready" : "waiting",
    parts: CRAFT_RECIPES[key].map((p) => ({ key: p, held: held.has(p) })),
  }));
}
