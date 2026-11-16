import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { copy } from "./copy";

// The phone's key-request notification (T3.2) is posted by native code, so its words live in strings.xml.
// They must stay the ones in copy.phoneKey.
const xml = readFileSync(resolve(__dirname, "../../../apps/mobile/modules/sparrow-blocker/android/src/main/res/values/strings.xml"), "utf8");
const strings = Object.fromEntries([...xml.matchAll(/<string name="([a-z0-9_]+)">([^<]*)<\/string>/g)].map((m) => [m[1], m[2].replace(/\\'/g, "'")]));

describe("key requests on the phone match copy.phoneKey", () => {
  const pairs: [string, string][] = [
    ["sparrow_key_channel", copy.phoneKey.channel],
    ["sparrow_key_title", copy.phoneKey.title],
    ["sparrow_key_body", copy.phoneKey.body],
    ["sparrow_key_let_out", copy.phoneKey.letOut],
    ["sparrow_key_keep_going", copy.phoneKey.keepGoing],
    ["sparrow_key_confirm_title", copy.phoneKey.confirmTitle],
    ["sparrow_key_confirm_body", copy.phoneKey.confirmBody],
    ["sparrow_key_confirm_yes", copy.phoneKey.confirmYes],
    ["sparrow_key_not_sent", copy.phoneKey.notSent],
    ["sparrow_key_unlock", copy.phoneKey.unlock],
  ];
  it.each(pairs)("%s", (name, text) => expect(strings[name]).toBe(text));
  it("says what Web Push says, and the same two answers", () => {
    expect(copy.phoneKey.title).toBe(copy.push.notification.key_request.title);
    expect(copy.phoneKey.letOut).toBe(copy.push.notification.letOut);
    expect(copy.phoneKey.keepGoing).toBe(copy.push.notification.keepGoing);
  });
});
