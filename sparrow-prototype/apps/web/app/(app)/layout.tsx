"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase";
import { NotConfigured } from "@/components/NotConfigured";

const NAV = [
  { href: "/today", label: "Today" },
  { href: "/tasks", label: "Tasks" },
  { href: "/focus", label: "Focus" },
  { href: "/settings", label: "Settings" },
];

function Guard({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else if (profile && !profile.onboarded && path !== "/onboarding") router.replace("/onboarding");
  }, [loading, session, profile, path, router]);

  if (loading || !session || !profile) return <main className="shell"><p className="quiet">Loading…</p></main>;

  return (
    <>
      <header className="topbar">
        <Link href="/today" className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} /> Sparrow
        </Link>
        {profile.onboarded && (
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>{n.label}</Link>
            ))}
          </nav>
        )}
      </header>
      <main className="shell">{children}</main>
      <footer className="shell small quiet" style={{ paddingTop: 0 }}>
        <Link href="/help">Support resources</Link>
      </footer>
    </>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  if (!isConfigured) return <NotConfigured />;
  return <AuthProvider><Guard>{children}</Guard></AuthProvider>;
}
