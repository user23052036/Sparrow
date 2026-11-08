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
  heavyStretchToday: "The last few days have been hard. Want to keep today small?",
  lightDayYes: "Yes, keep it small",
  lightDayNo: "No, I'll choose",
  lightDayNowOn: "Today is a small day: one or two things is plenty.",
  lightDayTomorrow: "Done. Tomorrow will be a small day: one or two things.",
  lightDayTomorrowNote: "Tomorrow morning you'll pick just one or two. You can change this in Settings.",
  lightDayOff: "Back to a regular day",
  supportLink: "Talking to someone can help. Support resources",
  helpTitle: "If things feel like too much",
  helpIntro:
    "Sparrow is a planning tool, not a replacement for care from people. If you are thinking about harming yourself, or you are in danger, please contact local emergency services now.",
  helpInside: "You can turn stakes off at any time in Settings, and you can make any day as small as one step.",
  blockedTitle: "This can wait.",
  blockedBody: "You asked Sparrow to keep this away during your focus time.",
  earlyExitPrompt: "Before you stop: what will you do instead?",
  duplicatePhoto:
    "This photo looks like one you've used before. You can still save it — it'll be marked so your buddy knows.",
  proofPrivate: "Your proof stays private unless you choose to share it.",
  partnerIntro:
    "A partner is one person who sees what you choose to share and holds the key to your locked focus sessions. You do the same for them.",
  partnerLockExplainer: (name: string) =>
    `Locked: only ${name} can end this session early. It still ends on its own when time is up.`,
  partnerKeyRequest: (name: string) => `Ask ${name} to end the session`,
  partnerWaiting: (name: string) => `You asked ${name}. Take a breath while you wait.`,
  partnerKeepGoing: (name: string) => `${name} asked you to keep going. You've got this.`,
  partnerLetGo: (name: string) => `${name} said it's okay to stop. Be kind to yourself.`,
  partnerDecideHint:
    "Stopping is okay when it's the right call. Encouraging them to keep going is kind when it's just the urge talking.",
  eventEarlyExit: "ended a focus session early",
  eventApproved: "ended a focus session early with their partner's okay",
  eventQuiet: "had blocking go quiet during a session",
  eventDisabled: "switched blocking off during a session",
} as const;

export const BANNED_WORDS = ["failed", "failure", "lazy", "broken", "wasted", "pathetic"];
