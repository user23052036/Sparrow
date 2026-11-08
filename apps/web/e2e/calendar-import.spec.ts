import { copy } from "@sparrow/shared";
import { expect, signIn, test } from "./fixtures";

const ics = (events: string[]) => Buffer.from(["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR", ""].join("\r\n"));
const event = (summary: string, start: string) => `BEGIN:VEVENT\r\nSUMMARY:${summary}\r\nDTSTART:${start}\r\nEND:VEVENT`;

test("events from a calendar file become tasks the user picks", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.goto("/tasks");

  await page.locator("#ics-file").setInputFiles({
    name: "week.ics",
    mimeType: "text/calendar",
    buffer: ics([event("Dentist", "20261109T090000Z"), event("Call Mum", "20261110T180000Z"), event("Team offsite", "20261112")]),
  });
  await expect(page.getByText(copy.tasks.importCount(3))).toBeVisible();

  await page.getByLabel(/Team offsite/).uncheck();
  await page.getByRole("button", { name: copy.tasks.importAdd(2) }).click();

  await expect(page.getByText(copy.tasks.importDone(2))).toBeVisible();
  expect(fake.db.tasks.map((t) => t.title)).toEqual(["Dentist", "Call Mum"]);
  expect(fake.db.tasks[0].notes).toBe("From your calendar: Mon 9 Nov, 09:00");
  await expect(page.getByText("Dentist", { exact: true })).toBeVisible();
});

test("a file with no events or the wrong kind of file gets a calm message", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.goto("/tasks");
  await page.locator("#ics-file").setInputFiles({ name: "empty.ics", mimeType: "text/calendar", buffer: ics([]) });
  await expect(page.locator("p.error")).toHaveText(copy.tasks.importNone);
  await page.locator("#ics-file").setInputFiles({ name: "notes.ics", mimeType: "text/calendar", buffer: Buffer.from("hello there") });
  await expect(page.locator("p.error")).toHaveText(copy.tasks.importNone);
  expect(fake.db.tasks).toHaveLength(0);
});

test("a very large file is refused before it is read", async ({ page, fake }) => {
  fake.seedUser();
  await signIn(page, fake);
  await page.goto("/tasks");
  await page.locator("#ics-file").setInputFiles({ name: "huge.ics", mimeType: "text/calendar", buffer: Buffer.alloc(1024 * 1024 + 10, "a") });
  await expect(page.locator("p.error")).toHaveText(copy.tasks.importTooBig);
});
