import { Platform } from "react-native";

export interface InstalledApp {
  packageName: string;
  label: string;
}

interface Native {
  getInstalledApps(): InstalledApp[];
}

let native: Native | null = null;
try {
  if (Platform.OS === "android") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    native = (require("expo-modules-core") as typeof import("expo-modules-core")).requireNativeModule<Native>("SparrowBlocker");
  }
} catch {
  native = null; // e.g. running in Expo Go: the manual-entry fallback is used instead
}

export const isNativeAvailable = native !== null;

/** Launchable apps installed on the phone, sorted by name. Empty when the native module isn't built in. */
export function getInstalledApps(): InstalledApp[] {
  if (!native) return [];
  return [...native.getInstalledApps()].sort((a, b) => a.label.localeCompare(b.label));
}
