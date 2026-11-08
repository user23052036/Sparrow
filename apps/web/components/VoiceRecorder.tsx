"use client";
import { useEffect, useRef, useState } from "react";
import { clockLabel, copy, MAX_VOICE_BYTES, MAX_VOICE_SECONDS, pickVoiceMime, VOICE_BITS_PER_SECOND } from "@sparrow/shared";

export interface Recording {
  blob: Blob;
  mime: string;
  ms: number;
}

/**
 * Records one short voice note with MediaRecorder. Stops by itself at MAX_VOICE_SECONDS.
 * The microphone is released as soon as recording stops or the component goes away.
 */
export function VoiceRecorder({ disabled, onRecorded, onCancel }: { disabled?: boolean; onRecorded: (r: Recording) => void; onCancel: () => void }) {
  const [state, setState] = useState<"idle" | "recording">("idle");
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(() => () => release(), []);

  async function start() {
    setMsg(null);
    const mime = pickVoiceMime((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) {
      setMsg(copy.proof.voiceUnsupported);
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMsg(copy.proof.micDenied);
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream.current, { mimeType: mime, audioBitsPerSecond: VOICE_BITS_PER_SECOND });
    const startedAt = Date.now();
    r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    r.onstop = () => {
      release();
      setState("idle");
      const blob = new Blob(chunks, { type: mime });
      if (blob.size > MAX_VOICE_BYTES) {
        setMsg(copy.proof.voiceTooBig);
        return;
      }
      onRecorded({ blob, mime, ms: Date.now() - startedAt });
    };
    rec.current = r;
    r.start(1000);
    setSecs(0);
    setState("recording");
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSecs(s);
      if (s >= MAX_VOICE_SECONDS && r.state === "recording") r.stop();
    }, 250);
  }

  function stop() {
    if (rec.current?.state === "recording") rec.current.stop();
  }

  if (!supported)
    return (
      <div className="stack">
        <p className="note small">{copy.proof.voiceUnsupported}</p>
        <button type="button" className="ghost" onClick={onCancel}>
          {copy.proof.cancel}
        </button>
      </div>
    );

  return (
    <div className="stack">
      <p className="small">{copy.proof.voiceLabel}</p>
      {state === "recording" ? (
        <>
          <p role="status" aria-live="polite">
            {copy.proof.recording(clockLabel(secs))}
          </p>
          <div>
            <button type="button" className="primary" onClick={stop}>
              {copy.proof.stopRecording}
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="primary" disabled={disabled} onClick={start}>
            {copy.proof.startRecording}
          </button>
          <button type="button" className="ghost" onClick={onCancel}>
            {copy.proof.cancel}
          </button>
        </div>
      )}
      <p className="small quiet">{copy.proofPrivate}</p>
      {msg && (
        <p className="note small" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
