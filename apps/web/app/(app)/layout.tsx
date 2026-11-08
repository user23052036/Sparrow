"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { copy } from "@sparrow/shared";
import { isConfigured, supabase } from "@/lib/supabase";
import { NotConfigured } from "@/components/NotConfigured";

const NAV = [
  { href: "/today", label: copy.nav.today },
  { href: "/tasks", label: copy.nav.tasks },
  { href: "/focus", label: copy.nav.focus },
  { href: "/partner", label: copy.nav.partner },
  { href: "/settings", label: copy.nav.settings },
];

function Guard({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      // Remember a partner invite so it still opens after signing in or up.
      try {
        if (window.location.pathname.startsWith("/partner/join")) sessionStorage.setItem("sparrow:next", window.location.pathname + window.location.search);
      } catch {
        /* storage unavailable */
      }
      router.replace("/login");
      return;
    }
    if (profile && !profile.onboarded && path !== "/onboarding") {
      router.replace("/onboarding");
      return;
    }
    if (profile?.onboarded) {
      try {
        const next = sessionStorage.getItem("sparrow:next");
        if (next) {
          sessionStorage.removeItem("sparrow:next");
          if (next.startsWith("/partner/join") && next !== path) router.replace(next);
        }
      } catch {
        /* storage unavailable */
      }
    }
  }, [loading, session, profile, path, router]);

  useEffect(() => {
    if (!session || !profile?.onboarded) return;
    let alive = true;
    const poll = () =>
      supabase()
        .rpc("partner_badge")
        .then(({ data }) => {
          if (alive) setBadge(typeof data === "number" ? data : 0);
        });
    void poll();
    const t = setInterval(poll, 45000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [session, profile?.onboarded, path]);

  if (loading || !session || !profile)
    return (
      <main className="shell">
        <p className="quiet">{copy.nav.loading}</p>
      </main>
    );

  return (
    <>
      <header className="topbar">
        <Link href="/today" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> Sparrow
        </Link>
        {profile.onboarded && (
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}>
                {n.label}
                {n.href === "/partner" && badge > 0 && (
                  <span className="badge" aria-label={`${badge} waiting for you`}>
                    {badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="shell">{children}</main>
      <footer className="shell small quiet" style={{ paddingTop: 0 }}>
        <Link href="/help">{copy.nav.support}</Link>
      </footer>
    </>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  if (!isConfigured) return <NotConfigured />;
  return (
    <AuthProvider>
      <Guard>{children}</Guard>
    </AuthProvider>
  );
}
