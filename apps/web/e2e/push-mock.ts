import type { Page } from "@playwright/test";

// Web Push (D38, T2.1). The browser's push manager and permission prompt are replaced with stand-ins, so these
// tests check what Sparrow does with them; the sending itself is covered by supabase/functions/notify tests.
export async function mockPush(page: Page, opts: { deny?: boolean } = {}) {
  await page.addInitScript(
    ({ deny }) => {
      const w = window as unknown as Record<string, unknown>;
      let current: unknown = null;
      const pushManager = {
        async getSubscription() {
          return current;
        },
        async subscribe(o: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) {
          w.__subscribed = { userVisibleOnly: o.userVisibleOnly, keyBytes: o.applicationServerKey.byteLength };
          current = {
            endpoint: "https://fcm.googleapis.com/fcm/send/this-browser",
            toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/this-browser", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } }),
            async unsubscribe() {
              current = null;
              w.__unsubscribed = true;
              return true;
            },
          };
          return current;
        },
      };
      const reg = { pushManager };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        get: () => ({ ready: Promise.resolve(reg), register: async () => reg, controller: null, addEventListener() {}, removeEventListener() {} }),
      });
      w.PushManager = function PushManager() {};
      let permission = "default";
      w.Notification = {
        get permission() {
          return permission;
        },
        async requestPermission() {
          permission = deny ? "denied" : "granted";
          return permission;
        },
      };
    },
    { deny: opts.deny ?? false },
  );
}
