import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { engine, isNativeAvailable } from "../modules/sparrow-blocker/src";
import { key, supabase, url } from "./supabase";

/**
 * The backend treats every `android` row in `devices` as a phone that blocks apps, and logs
 * "blocking went quiet" when it stops checking in during a session (D17). So a phone is
 * registered only once it CAN block: the native engine is built in (development build) and the
 * person has switched on Sparrow in Settings > Accessibility (the Protection tab walks them
 * through it). Before that, nothing is registered and no tamper events can appear.
 */
export const ENGINE_READY = isNativeAvailable;

const KEY = "sparrow:deviceId";

function uuid(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

export async function getDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(KEY);
  if (stored) return stored;
  const id = uuid();
  await AsyncStorage.setItem(KEY, id);
  return id;
}

async function heartbeat(id: string, protection: boolean) {
  return await supabase.rpc("heartbeat", {
    p_device_id: id,
    p_platform: "android",
    p_label: Device.modelName ?? "Android phone",
    p_protection: protection,
  });
}

/**
 * Registers this phone and hands the native engine its own device secret (D29), so it can keep
 * blocking and checking in after the app is closed. Safe to call often; does nothing until
 * protection is switched on. Returns true when the engine is set up.
 */
export async function setUpEngine(): Promise<boolean> {
  if (!ENGINE_READY || !engine.protectionOn()) return false;
  let id = await getDeviceId();
  let hb = await heartbeat(id, true);
  if (hb.error && /another account/.test(hb.error.message)) {
    // Someone else used this phone with Sparrow before: start over with a fresh id.
    await AsyncStorage.removeItem(KEY);
    engine.clear();
    id = await getDeviceId();
    hb = await heartbeat(id, true);
  }
  if (hb.error) return false;
  if (engine.configuredDeviceId() !== id || engine.state()?.status === "signed_out") {
    const { data, error } = await supabase.rpc("issue_device_secret", { p_device_id: id });
    if (error || typeof data !== "string") return false;
    engine.configure(url, key, id, data);
  }
  await engine.syncNow();
  return true;
}

/** Signing out: the phone forgets its secret, and blocking stops with it. */
export async function forgetEngine(): Promise<void> {
  engine.clear();
}
