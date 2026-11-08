"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { copy, parseInviteCode } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";

interface Preview {
  valid: boolean;
  from?: string;
  reason?: string;
}

function JoinInner() {
  const router = useRouter();
  const code = parseInviteCode(useSearchParams().get("code") ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setPreview({ valid: false, reason: copy.join.missingCode });
      return;
    }
    supabase()
      .rpc("preview_buddy_invite", { p_code: code })
      .then(({ data, error }) => {
        if (error) setErr(errorText(error));
        else setPreview(data as Preview);
      });
  }, [code]);

  async function accept() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("accept_buddy_invite", { p_code: code });
    setBusy(false);
    if (error) setErr(errorText(error));
    else router.replace("/partner");
  }

  if (err && !preview)
    return (
      <p className="error" role="alert">
        {err}
      </p>
    );
  if (!preview) return <p className="quiet">{copy.join.checking}</p>;

  return (
    <div className="stack">
      <h1>{copy.join.title}</h1>
      {preview.valid ? (
        <div className="panel stack">
          <p>{copy.join.wouldLike(preview.from ?? "")}</p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {copy.join.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="row">
            <button className="primary" disabled={busy} onClick={accept}>
              {copy.join.accept}
            </button>
            <Link className="button ghost" href="/today">
              {copy.join.notNow}
            </Link>
          </div>
        </div>
      ) : (
        <div className="panel stack">
          <p>{preview.reason}</p>
          <div>
            <Link className="button" href="/partner">
              {copy.join.goPartner}
            </Link>
          </div>
        </div>
      )}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

export default function Join() {
  return (
    <Suspense>
      <JoinInner />
    </Suspense>
  );
}
