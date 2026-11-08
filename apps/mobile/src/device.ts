import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

/**
 * The backend treats every `android` row in `devices` as a *blocking* device and
 * logs "blocking went quiet" when its heartbeat stops during a session. Until the
 * native blocker (M5b-2) and background heartbeat (M5b-4) exist, registering this
 * phone would create false tamper events visible to the user's partner. So
 * registration stays off in this shell. Flip to true when the blocker ships.
 */
export const ENGINE_READY = false;

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

/** Registers this phone (and its FCM token) with the backend. No-op until ENGINE_READY. */
export async function registerDevice(protectionOn: boolean): Promise<void> {
  if (!ENGINE_READY) return;
  const id = await getDeviceId();
  await supabase.rpc("heartbeat", {
    p_device_id: id,
    p_platform: "android",
    p_label: Device.modelName ?? "Android phone",
    p_protection: protectionOn,
  });
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    // Raw FCM token (not an Expo push token): the Edge Function sends via FCM directly (M5b-3).
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data === "string") await supabase.rpc("set_push_token", { p_device_id: id, p_token: token.data });
  } catch {
    // Push is optional; the app still works without it.
  }
}
