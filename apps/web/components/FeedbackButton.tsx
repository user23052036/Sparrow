"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { copy } from "@sparrow/shared";
import { errorText, supabase } from "@/lib/supabase";

/** One-way feedback inbox. Optional 1-5 "how helpful" rating plus free text. */
export function FeedbackButton() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [helpful, setHelpful] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setErr(copy.feedback.needText);
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await supabase()
      .from("feedback")
      .insert({ message: text.trim(), helpful, page: path.slice(0, 100) });
    setBusy(false);
    if (error) {
      setErr(errorText(error));
      return;
    }
    setText("");
    setHelpful(null);
    setOpen(false);
    setMsg(copy.feedback.thanks);
  }

  return (
    <div className="stack">
      {msg && (
        <p className="note small" role="status">
          {msg}
        </p>
      )}
      {!open ? (
        <div>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setOpen(true);
              setMsg(null);
            }}
          >
            {copy.feedback.open}
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="panel stack" aria-label={copy.feedback.title}>
          <h3>{copy.feedback.title}</h3>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, marginBottom: "0.4rem" }}>{copy.feedback.helpfulQ}</legend>
            <div className="row" role="radiogroup">
              {copy.feedback.scale.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={helpful === i + 1}
                  aria-pressed={helpful === i + 1}
                  onClick={() => setHelpful(i + 1)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="feedback-text">{copy.feedback.messageLabel}</label>
            <textarea id="feedback-text" value={text} maxLength={2000} placeholder={copy.feedback.placeholder} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="row">
            <button className="primary" disabled={busy}>
              {copy.feedback.send}
            </button>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>
              {copy.feedback.close}
            </button>
          </div>
          {err && (
            <p className="error" role="alert">
              {err}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
