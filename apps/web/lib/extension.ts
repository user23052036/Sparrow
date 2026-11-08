"use client";
/**
 * Talks to the Sparrow browser extension through window.postMessage. The
 * extension's content script (apps/extension/content.js) relays messages to its
 * background worker and posts replies back with source "sparrow-ext".
 */
export interface ExtStatus {
  installed: boolean;
  connected?: boolean;
  email?: string | null;
  deviceId?: string;
  focusActive?: boolean;
  version?: string;
}

export function extRequest<T = Record<string, unknown>>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      reject(new Error("timeout"));
    }, timeoutMs);
    function onMsg(e: MessageEvent) {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; replyTo?: string; ok?: boolean; error?: string } & T;
      if (d?.source !== "sparrow-ext" || d.replyTo !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      if (d.ok === false) reject(new Error(d.error || "The extension reported an error"));
      else resolve(d);
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "sparrow-web", id, type, ...payload }, window.location.origin);
  });
}

export async function extStatus(): Promise<ExtStatus> {
  try {
    const r = await extRequest<Omit<ExtStatus, "installed">>("SPARROW_STATUS", {}, 1200);
    return { installed: true, ...r };
  } catch {
    return { installed: false };
  }
}

/** Ask the extension to sync now (fire-and-forget; it also polls every 30 s). */
export function extSyncNow() {
  extRequest("SPARROW_SYNC_NOW", {}, 3000).catch(() => {});
}
