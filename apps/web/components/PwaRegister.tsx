"use client";
import { useEffect } from "react";
import { basePath } from "@/lib/site";

/** Registers the service worker in production builds only (it would get in the way of hot reload). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => {
      /* installability is a nicety; the app works without it */
    });
  }, []);
  return null;
}
