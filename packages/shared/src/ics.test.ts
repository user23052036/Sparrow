import { describe, expect, it } from "vitest";
import { eventNote, MAX_ICS_EVENTS, parseIcs } from "./ics";

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
const ev = (props: string) => `BEGIN:VEVENT\r\n${props}\r\nEND:VEVENT`;

describe("parseIcs", () => {
  it("reads title, date and time (UTC, floating and TZID forms)", () => {
    const r = parseIcs(
      wrap(
        [
          ev("SUMMARY:Dentist\r\nDTSTART:20261109T090000Z"),
          ev("SUMMARY:Gym\r\nDTSTART;TZID=Asia/Kolkata:20261110T183000"),
          ev("SUMMARY:Pay rent\r\nDTSTART;VALUE=DATE:20261101"),
        ].join("\r\n"),
      ),
    );
    expect(r).toEqual([
      { title: "Pay rent", date: "2026-11-01", time: null },
      { title: "Dentist", date: "2026-11-09", time: "09:00" },
      { title: "Gym", date: "2026-11-10", time: "18:30" },
    ]);
  });
  it("unfolds long lines and unescapes text", () => {
    const r = parseIcs(wrap(ev("SUMMARY:Plan the\r\n  quarter\\, then\\; relax\\nsoon\r\nDTSTART:20261109")));
    expect(r[0].title).toBe("Plan the quarter, then; relax soon");
  });
  it("skips cancelled events, untitled events and alarms inside events", () => {
    const r = parseIcs(
      wrap(
        [
          ev("SUMMARY:Called off\r\nSTATUS:CANCELLED\r\nDTSTART:20261109"),
          ev("DTSTART:20261109"),
          ev("SUMMARY:Real\r\nDTSTART:20261109\r\nBEGIN:VALARM\r\nSUMMARY:Reminder text\r\nEND:VALARM"),
        ].join("\r\n"),
      ),
    );
    expect(r.map((e) => e.title)).toEqual(["Real"]);
  });
  it("removes duplicates by UID and by content", () => {
    const r = parseIcs(
      wrap(
        [
          ev("UID:a\r\nSUMMARY:One\r\nDTSTART:20261109"),
          ev("UID:a\r\nSUMMARY:One again\r\nDTSTART:20261110"),
          ev("SUMMARY:Two\r\nDTSTART:20261109"),
          ev("SUMMARY:Two\r\nDTSTART:20261109"),
        ].join("\r\n"),
      ),
    );
    expect(r.map((e) => e.title)).toEqual(["One", "Two"]);
  });
  it("keeps undated events at the end", () => {
    const r = parseIcs(wrap([ev("SUMMARY:Someday"), ev("SUMMARY:Dated\r\nDTSTART:20261109")].join("\r\n")));
    expect(r.map((e) => e.title)).toEqual(["Dated", "Someday"]);
  });
  it("ignores impossible dates and garbage", () => {
    expect(parseIcs(wrap(ev("SUMMARY:Odd\r\nDTSTART:20261399")))[0]).toEqual({ title: "Odd", date: null, time: null });
    expect(parseIcs("not a calendar at all")).toEqual([]);
    expect(parseIcs("")).toEqual([]);
    expect(parseIcs("BEGIN:VEVENT\nSUMMARY:No end")).toEqual([]);
  });
  it("accepts LF-only files and lowercase keywords", () => {
    const r = parseIcs("begin:vevent\nsummary:Lowercase\ndtstart:20261109T0800\nend:vevent\n");
    expect(r).toEqual([{ title: "Lowercase", date: "2026-11-09", time: "08:00" }]);
  });
  it("caps titles at 120 characters and the list at 50 events", () => {
    const long = parseIcs(wrap(ev(`SUMMARY:${"x".repeat(300)}`)));
    expect(long[0].title.length).toBe(120);
    const many = parseIcs(wrap(Array.from({ length: 80 }, (_, i) => ev(`SUMMARY:E${i}\r\nDTSTART:2026110${(i % 9) + 1}`)).join("\r\n")));
    expect(many.length).toBe(MAX_ICS_EVENTS);
  });
});

describe("eventNote", () => {
  it("describes dated, timed and undated events", () => {
    expect(eventNote({ title: "x", date: "2026-11-09", time: "09:00" })).toBe("From your calendar: Mon 9 Nov, 09:00");
    expect(eventNote({ title: "x", date: "2026-11-01", time: null })).toBe("From your calendar: Sun 1 Nov");
    expect(eventNote({ title: "x", date: null, time: null })).toBe("From your calendar");
  });
});
