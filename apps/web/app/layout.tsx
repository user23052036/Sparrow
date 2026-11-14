import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { basePath } from "@/lib/site";
import { contentSecurityPolicy, REFERRER_POLICY } from "@/lib/csp";

const exporting = process.env.STATIC_EXPORT === "1";
const csp = contentSecurityPolicy(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", { dev: process.env.NODE_ENV === "development" });

export const metadata: Metadata = {
  title: "Sparrow",
  description: "Gentle daily accountability: small steps, real focus, kind follow-through.",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: { icon: `${basePath}/icon.svg` },
  referrer: REFERRER_POLICY,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2ef" },
    { media: "(prefers-color-scheme: dark)", color: "#141b1e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Security headers (T1.5): also sent as real headers by `next start` (next.config.ts). */}
        <meta httpEquiv="Content-Security-Policy" content={csp} />
        {exporting && (
          // A static host can't send frame-ancestors, so the exported pages refuse to show inside a frame themselves.
          <>
            <style dangerouslySetInnerHTML={{ __html: "html{visibility:hidden}" }} />
            <script
              dangerouslySetInnerHTML={{
                __html: 'if(self===top){document.documentElement.style.visibility="visible"}else{top.location=self.location.href}',
              }}
            />
          </>
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600..700&display=swap"
        />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
