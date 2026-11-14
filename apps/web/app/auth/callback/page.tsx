"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copy } from "@sparrow/shared";
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
      <p>{copy.auth.signingIn}</p>
      {stuck && (
        <p className="note">
          {copy.auth.callbackSlow} <Link href="/login">{copy.auth.backToSignIn}</Link>
        </p>
      )}
    </main>
  );
}
