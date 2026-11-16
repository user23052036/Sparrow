"use client";
import { useState } from "react";
import { copy, guestKeyUrl, normalizeGuestName, GUEST_NAME_MAX, type NewGuestKey } from "@sparrow/shared";
import { errorText, supabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";
import { timeAgo } from "@/lib/format";

async function makeKey(name: string): Promise<{ key: NewGuestKey } | { error: string }> {
  const { data, error } = await supabase().rpc("create_guest_key", { p_name: name });
  return error ? { error: errorText(error) } : { key: data as NewGuestKey };
}

/** Partner page, nobody holds the key yet: make a key link for a friend without an account (D39). */
export function GuestKeyCreate({ onCreated }: { onCreated: (k: NewGuestKey) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clean = normalizeGuestName(name);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!clean) return;
    setBusy(true);
    setErr(null);
    const r = await makeKey(clean);
    setBusy(false);
    if ("error" in r) setErr(r.error);
    else onCreated(r.key);
  }

  return (
    <form className="panel stack" onSubmit={create} aria-label={copy.guestKey.title}>
      <h3>{copy.guestKey.title}</h3>
      <p>{copy.guestKey.body}</p>
      <label htmlFor="guest-name">{copy.guestKey.nameLabel}</label>
      <input
        id="guest-name"
        value={name}
        maxLength={GUEST_NAME_MAX + 10}
        placeholder={copy.guestKey.namePlaceholder}
        onChange={(e) => setName(e.target.value)}
      />
      <div>
        <button disabled={busy || !clean}>{copy.guestKey.create}</button>
      </div>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}

/** The new link, shown once: only a fingerprint of the key is kept. */
export function GuestKeyShown({ guest, onDone }: { guest: NewGuestKey; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = guestKeyUrl(siteUrl(), guest.key);
  return (
    <div className="panel stack" role="status">
      <h3>{copy.guestKey.newTitle(guest.name)}</h3>
      <p>{copy.guestKey.newOnce}</p>
      <input readOnly aria-label={copy.guestKey.linkLabel} value={url} onFocus={(e) => e.currentTarget.select()} />
      <div className="row">
        <button
          className="primary"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? copy.partnerUi.copied : copy.partnerUi.copyLink}
        </button>
        <button className="ghost" onClick={onDone}>
          {copy.guestKey.done}
        </button>
      </div>
    </div>
  );
}

/** A friend holds the key through a link: when they last opened it, a new link, or take the key back. */
export function GuestKeyHeld({
  guest,
  onNewKey,
  onRemoved,
}: {
  guest: { name: string; last_seen_at: string | null };
  onNewKey: (k: NewGuestKey) => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function newLink() {
    setBusy(true);
    setErr(null);
    const r = await makeKey(guest.name);
    setBusy(false);
    if ("error" in r) setErr(r.error);
    else onNewKey(r.key);
  }
  async function takeBack() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("remove_guest_key");
    setBusy(false);
    if (error) setErr(errorText(error));
    else onRemoved();
  }

  return (
    <div className="panel stack">
      <h3>{copy.guestKey.holding(guest.name)}</h3>
      <p>{copy.guestKey.holdingBody(guest.name)}</p>
      <p className="small quiet">{copy.guestKey.seen(guest.last_seen_at ? timeAgo(guest.last_seen_at) : null)}</p>
      {confirm ? (
        <div className="stack">
          <p>{copy.guestKey.takeBackConfirm(guest.name)}</p>
          <div className="row">
            <button disabled={busy} onClick={takeBack}>
              {copy.guestKey.yesTakeBack}
            </button>
            <button className="ghost" onClick={() => setConfirm(false)}>
              {copy.guestKey.keep}
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button disabled={busy} onClick={newLink}>
            {copy.guestKey.newLink}
          </button>
          <button className="ghost" onClick={() => setConfirm(true)}>
            {copy.guestKey.takeBack}
          </button>
        </div>
      )}
      <p className="small quiet">{copy.guestKey.newLinkHint}</p>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
