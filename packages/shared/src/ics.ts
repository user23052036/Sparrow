/**
 * A small, forgiving reader for iCalendar (.ics) files, enough to turn calendar events into
 * task suggestions. Handles folded lines, escaped text, all-day events, TZID/UTC times and
 * cancelled events. It does not expand repeating events (only the first one is listed) and it
 * never fetches anything: the file is read in the browser.
 */
export interface CalendarEvent {
  title: string;
  /** YYYY-MM-DD as written in the file, or null. */
  date: string | null;
  /** HH:MM as written in the file, or null for all-day events. */
  time: string | null;
}

export const MAX_ICS_BYTES = 1024 * 1024;
export const MAX_ICS_EVENTS = 50;
export const MAX_TITLE = 120;

function unfold(text: string): string[] {
  return text
    .replace(/\r\n|\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}
function unescapeText(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === "n" || c === "N" ? " " : c));
}
function parseStart(value: string): { date: string | null; time: string | null } {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return { date: null, time: null };
  const [, y, mo, d, h, mi] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return { date: null, time: null };
  return { date: `${y}-${mo}-${d}`, time: h !== undefined ? `${h}:${mi}` : null };
}

export function parseIcs(text: string): CalendarEvent[] {
  const lines = unfold(text);
  const events: (CalendarEvent & { uid: string | null })[] = [];
  let cur: { title: string; date: string | null; time: string | null; uid: string | null; cancelled: boolean; depth: number } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      cur = { title: "", date: null, time: null, uid: null, cancelled: false, depth: 0 };
      continue;
    }
    if (!cur) continue;
    if (upper.startsWith("BEGIN:")) {
      cur.depth++; // e.g. VALARM inside an event: its SUMMARY/DESCRIPTION are not the event's
      continue;
    }
    if (upper === "END:VEVENT") {
      const title = cur.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE).trim();
      if (title && !cur.cancelled) events.push({ title, date: cur.date, time: cur.time, uid: cur.uid });
      cur = null;
      continue;
    }
    if (upper.startsWith("END:")) {
      cur.depth = Math.max(0, cur.depth - 1);
      continue;
    }
    if (cur.depth > 0) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(";")[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (name === "SUMMARY") cur.title = unescapeText(value);
    else if (name === "DTSTART") Object.assign(cur, parseStart(value));
    else if (name === "UID") cur.uid = value.trim();
    else if (name === "STATUS" && value.trim().toUpperCase() === "CANCELLED") cur.cancelled = true;
  }

  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const e of events) {
    const key = e.uid ?? `${e.title}|${e.date}|${e.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: e.title, date: e.date, time: e.time });
  }
  // Dated events first in date order; undated ones keep their file order at the end.
  out.sort((a, b) => (a.date && b.date ? `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`) : a.date ? -1 : b.date ? 1 : 0));
  return out.slice(0, MAX_ICS_EVENTS);
}

/** A short note for the imported task, e.g. "From your calendar: Mon 9 Nov, 09:00". */
export function eventNote(e: CalendarEvent): string {
  if (!e.date) return "From your calendar";
  const d = new Date(`${e.date}T12:00:00Z`);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; // fixed text: no locale differences between machines
  return `From your calendar: ${day}${e.time ? `, ${e.time}` : ""}`;
}
