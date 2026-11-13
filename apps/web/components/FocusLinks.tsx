"use client";
import { useCallback, useEffect, useState } from "react";
import {
  copy,
  FOCUS_LINK_DEFAULT_MINUTES,
  FOCUS_LINK_LABEL_MAX,
  FOCUS_LINK_MAX,
  FOCUS_LINK_MAX_MINUTES,
  FOCUS_LINK_MIN_MINUTES,
  focusLinkCurl,
  focusLinkUrl,
  normalizeFocusLinkLabel,
  validFocusLinkMinutes,
  type FocusLink,
  type NewFocusLink,
} from "@sparrow/shared";
import { errorText, supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

function CopyField({ id, label, value, button }: { id: string; label: string; value: string; button: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <label htmlFor={id}>{label}</label>
      <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? copy.focusLinks.copied : button}
        </button>
      </div>
    </div>
  );
}

/** D35: links that can only start a focus session (for tags, shortcuts and routines). */
export function FocusLinks() {
  const [links, setLinks] = useState<FocusLink[] | null>(null);
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState(String(FOCUS_LINK_DEFAULT_MINUTES));
  const [fresh, setFresh] = useState<NewFocusLink | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from("focus_links").select("id,label,minutes,created_at,last_used_at,use_count").order("created_at");
    if (error) setErr(errorText(error));
    else setLinks((data ?? []) as FocusLink[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const tidy = normalizeFocusLinkLabel(label);
  const mins = Number(minutes);
  const full = (links?.length ?? 0) >= FOCUS_LINK_MAX;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!tidy || !validFocusLinkMinutes(mins)) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase().rpc("create_focus_link", { p_label: tidy, p_minutes: mins });
    setBusy(false);
    if (error) {
      setErr(errorText(error));
      return;
    }
    setFresh(data as NewFocusLink);
    setLabel("");
    await load();
  }

  async function remove(id: string) {
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("remove_focus_link", { p_id: id });
    setBusy(false);
    setRemoving(null);
    if (error) setErr(errorText(error));
    if (fresh?.id === id) setFresh(null);
    await load();
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section className="panel stack" aria-label={copy.focusLinks.title}>
      <h3>{copy.focusLinks.title}</h3>
      <p className="quiet">{copy.focusLinks.intro}</p>
      <p className="small quiet">{copy.focusLinks.limits}</p>

      {fresh && (
        <div className="note stack" role="status">
          <strong>{copy.focusLinks.newTitle(fresh.label)}</strong>
          <p className="small">{copy.focusLinks.newOnce}</p>
          <CopyField id="focus-link-url" label={copy.focusLinks.linkLabel} value={focusLinkUrl(origin, fresh.key)} button={copy.focusLinks.copyLink} />
          <details>
            <summary className="small">{copy.focusLinks.requestTitle}</summary>
            <CopyField
              id="focus-link-request"
              label={copy.focusLinks.requestLabel}
              value={focusLinkCurl(SUPABASE_URL, SUPABASE_ANON_KEY, fresh.key)}
              button={copy.focusLinks.copyRequest}
            />
          </details>
          <div>
            <button type="button" className="ghost" onClick={() => setFresh(null)}>
              {copy.focusLinks.done}
            </button>
          </div>
        </div>
      )}

      {links && links.length === 0 && !fresh && <p className="quiet">{copy.focusLinks.empty}</p>}
      {links && links.length > 0 && (
        <ul style={{ listStyle: "none" }} aria-label={copy.focusLinks.title}>
          {links.map((l) => (
            <li key={l.id} className="item" aria-label={l.label}>
              <div className="spread">
                <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  <strong>{l.label}</strong>
                  <span className="small">{copy.focusLinks.row(l.minutes)}</span>
                  <span className="small quiet">
                    {copy.focusLinks.used(
                      l.use_count,
                      l.last_used_at ? new Date(l.last_used_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null,
                    )}
                  </span>
                </div>
                {removing !== l.id && (
                  <button type="button" className="ghost" disabled={busy} onClick={() => setRemoving(l.id)}>
                    {copy.focusLinks.remove(l.label)}
                  </button>
                )}
              </div>
              {removing === l.id && (
                <div className="stack">
                  <p style={{ margin: 0 }}>{copy.focusLinks.removeConfirm(l.label)}</p>
                  <div className="row">
                    <button type="button" className="primary" disabled={busy} onClick={() => remove(l.id)}>
                      {copy.focusLinks.yesRemove}
                    </button>
                    <button type="button" className="ghost" onClick={() => setRemoving(null)}>
                      {copy.focusLinks.keep}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="small quiet">{copy.focusLinks.full(FOCUS_LINK_MAX)}</p>
      ) : (
        <form className="stack" onSubmit={create}>
          <label htmlFor="focus-link-name">{copy.focusLinks.nameLabel}</label>
          <input
            id="focus-link-name"
            value={label}
            maxLength={FOCUS_LINK_LABEL_MAX}
            placeholder={copy.focusLinks.namePlaceholder}
            onChange={(e) => setLabel(e.target.value)}
          />
          <label htmlFor="focus-link-minutes">{copy.focusLinks.minutesLabel}</label>
          <input
            id="focus-link-minutes"
            type="number"
            inputMode="numeric"
            min={FOCUS_LINK_MIN_MINUTES}
            max={FOCUS_LINK_MAX_MINUTES}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <div>
            <button disabled={busy || !tidy || !validFocusLinkMinutes(mins)}>{copy.focusLinks.create}</button>
          </div>
        </form>
      )}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
