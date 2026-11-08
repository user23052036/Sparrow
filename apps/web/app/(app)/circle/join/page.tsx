"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { copy, parseCircleCode } from "@sparrow/shared";
import { supabase, errorText } from "@/lib/supabase";

interface Preview {
  valid: boolean;
  name?: string;
  members?: number;
  reason?: string;
}

function JoinInner() {
  const router = useRouter();
  const code = parseCircleCode(useSearchParams().get("code") ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setPreview({ valid: false, reason: copy.circleJoin.missingCode });
      return;
    }
    supabase()
      .rpc("preview_circle_invite", { p_code: code })
      .then(({ data, error }) => {
        if (error) setErr(errorText(error));
        else setPreview(data as Preview);
      });
  }, [code]);

  async function join() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase().rpc("join_circle", { p_code: code });
    setBusy(false);
    if (error) setErr(errorText(error));
    else router.replace("/circle");
  }

  if (err && !preview)
    return (
      <p className="error" role="alert">
        {err}
      </p>
    );
  if (!preview) return <p className="quiet">{copy.circleJoin.checking}</p>;

  return (
    <div className="stack">
      <h1>{copy.circleJoin.title}</h1>
      {preview.valid ? (
        <div className="panel stack">
          <p>{copy.circleJoin.wouldLike(preview.name ?? "", preview.members ?? 0)}</p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {copy.circleJoin.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="row">
            <button className="primary" disabled={busy} onClick={join}>
              {copy.circleJoin.join}
            </button>
            <Link className="button ghost" href="/today">
              {copy.circleJoin.notNow}
            </Link>
          </div>
        </div>
      ) : (
        <div className="panel stack">
          <p>{preview.reason}</p>
          <div>
            <Link className="button" href="/circle">
              {copy.circleJoin.goCircle}
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

export default function CircleJoin() {
  return (
    <Suspense>
      <JoinInner />
    </Suspense>
  );
}
