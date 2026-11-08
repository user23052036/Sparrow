"use client";
import { useEffect } from "react";

/** Registers the service worker in production builds only (it would get in the way of hot reload). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installability is a nicety; the app works without it */
    });
  }, []);
  return null;
}
