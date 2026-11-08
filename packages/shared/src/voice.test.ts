import { describe, expect, it } from "vitest";
import { clockLabel, MAX_VOICE_SECONDS, pickVoiceMime, storageType, voiceExtension, voiceSeconds } from "./voice";

describe("voice notes", () => {
  it("picks the first type the browser supports", () => {
    expect(pickVoiceMime((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickVoiceMime((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickVoiceMime(() => false)).toBeNull();
  });
  it("maps recorder types to bucket types and file extensions", () => {
    expect(storageType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(storageType("audio/mp4")).toBe("audio/mp4");
    expect(storageType("audio/wav")).toBeNull();
    expect(voiceExtension("audio/ogg;codecs=opus")).toBe("ogg");
    expect(voiceExtension("audio/mp4")).toBe("m4a");
    expect(voiceExtension("audio/webm")).toBe("webm");
  });
  it("stores whole seconds between 1 and the cap (matches the database check)", () => {
    expect(voiceSeconds(200)).toBe(1);
    expect(voiceSeconds(12_400)).toBe(12);
    expect(voiceSeconds(95_000)).toBe(MAX_VOICE_SECONDS);
    expect(MAX_VOICE_SECONDS).toBe(60);
  });
  it("formats a clock label", () => {
    expect(clockLabel(7)).toBe("0:07");
    expect(clockLabel(60)).toBe("1:00");
  });
});
