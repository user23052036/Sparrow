import { describe, expect, it } from "vitest";
import { cleanIfThen, ifThenLine, IF_THEN_MAX } from "./ifthen";

describe("cleanIfThen", () => {
  it("keeps a normal pair", () => {
    expect(cleanIfThen("it's 9 am at my desk", "open the doc for five minutes")).toEqual({
      if_cue: "it's 9 am at my desk",
      then_action: "open the doc for five minutes",
    });
  });
  it("drops leading 'If' and 'then I will' and trailing punctuation", () => {
    expect(cleanIfThen("If I feel stuck.", "Then I will walk for 5 minutes!")).toEqual({
      if_cue: "I feel stuck",
      then_action: "walk for 5 minutes",
    });
    expect(cleanIfThen("if it rains", "I'll read")).toEqual({ if_cue: "it rains", then_action: "read" });
  });
  it("squashes whitespace", () => {
    expect(cleanIfThen("  I   sit  down ", " stretch ")).toEqual({ if_cue: "I sit down", then_action: "stretch" });
  });
  it("clears the plan unless both parts are filled", () => {
    const none = { if_cue: null, then_action: null };
    expect(cleanIfThen("", "walk")).toEqual(none);
    expect(cleanIfThen("I sit", "   ")).toEqual(none);
    expect(cleanIfThen("If ", "then I will")).toEqual(none);
  });
  it("caps each part at the database limit", () => {
    const r = cleanIfThen("x".repeat(500), "y".repeat(500));
    expect(r.if_cue!.length).toBe(IF_THEN_MAX);
    expect(r.then_action!.length).toBe(IF_THEN_MAX);
  });
});

describe("ifThenLine", () => {
  it("reads as a sentence", () => {
    expect(ifThenLine({ if_cue: "I sit down", then_action: "open the doc" })).toBe("If I sit down, then I will open the doc.");
  });
  it("is null without a full plan", () => {
    expect(ifThenLine({ if_cue: null, then_action: null })).toBeNull();
    expect(ifThenLine({ if_cue: "I sit down", then_action: null })).toBeNull();
  });
});
