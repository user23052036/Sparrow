/**
 * All user-facing wording that carries emotional weight lives here so it can be
 * reviewed against the gentle-language checklist in docs/PLAN.md §7.
 * Never use: "failed", "lazy", "broken", "wasted".
 */
export const copy = {
  gentleModeExplainer:
    "Gentle Mode means no stakes. You plan, you try, and every small step counts.",
  morningPrompt: "What would make today feel like a good day? Pick one to five things.",
  moodPrompt: "How are you arriving today?",
  lowMoodOffer:
    "Today sounds heavy. Want to keep it to one or two small steps? That's a real day too.",
  stakeExplainer: (n: number) =>
    `You're setting aside ${n} points. Finish your list to get them back, plus your day's points. Partial progress gets part of them back.`,
  eveningPrompt: "Let's look back gently. What happened with each one?",
  partialWin: (done: number, total: number) =>
    total === 0 ? "You showed up today. That counts." : `You moved ${done} of ${total} forward today. That's real progress.`,
  fullDay: "Everything you planned, done. Take a moment with that.",
  oneSmallWin: "Some things didn't happen today, and that's okay. Want one five-minute win before bed?",
  heavyStretch: "The last few days have been hard. Want to make tomorrow lighter?",
  blockedTitle: "This can wait.",
  blockedBody: "You asked Sparrow to keep this away during your focus time.",
  earlyExitPrompt: "Before you stop: what will you do instead?",
  duplicatePhoto:
    "This photo looks like one you've used before. You can still save it — it'll be marked so your buddy knows.",
  proofPrivate: "Your proof stays private unless you choose to share it.",
} as const;

export const BANNED_WORDS = ["failed", "failure", "lazy", "broken", "wasted", "pathetic"];
