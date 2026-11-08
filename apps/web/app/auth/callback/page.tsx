"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/** Magic-link landing page. supabase-js exchanges the ?code= automatically (same browser only). */
export default function Callback() {
  const router = useRouter();
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const sb = supabase();
    const { data } = sb.auth.onAuthStateChange((_e, s) => {
      if (s) router.replace("/today");
    });
    sb.auth.getSession().then(({ data: d }) => {
      if (d.session) router.replace("/today");
    });
    const t = setTimeout(() => setStuck(true), 6000);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [router]);
  return (
    <main className="shell">
      <p>Signing you in…</p>
      {stuck && (
        <p className="note">
          This is taking a while. If you opened the link in a different browser or device, go back to where you started and enter the code from the email
          instead. <a href="/login">Back to sign in</a>
        </p>
      )}
    </main>
  );
}
