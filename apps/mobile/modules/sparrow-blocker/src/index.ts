import { Platform } from "react-native";

export interface InstalledApp {
  packageName: string;
  label: string;
}

export interface EngineState {
  configured: boolean;
  /** "signed_out" when the server refused this phone's secret. */
  status: string;
  active: boolean;
  endsAtMs: number;
  packages: string[];
  lastSyncMs: number;
}

interface Native {
  getInstalledApps(): InstalledApp[];
  configure(url: string, anonKey: string, deviceId: string, secret: string): void;
  configuredDeviceId(): string | null;
  clearConfig(): void;
  setAlsoAllowed(packages: string[]): void;
  syncNow(): Promise<{ ok: boolean; status: string; active: boolean; endsAtMs: number; packages: string[] }>;
  getEngineState(): EngineState;
  isProtectionEnabled(): boolean;
  openAccessibilitySettings(): void;
  isIgnoringBatteryOptimizations(): boolean;
  openBatterySettings(): void;
  openAutostartSettings(): boolean;
  manufacturer(): string;
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

/** Everything below is a safe no-op (or "off") without the native module. */
export const engine = {
  configure: (url: string, anonKey: string, deviceId: string, secret: string) => native?.configure(url, anonKey, deviceId, secret),
  configuredDeviceId: (): string | null => native?.configuredDeviceId() ?? null,
  clear: () => native?.clearConfig(),
  setAlsoAllowed: (p: string[]) => native?.setAlsoAllowed(p),
  syncNow: async () => (native ? await native.syncNow() : null),
  state: (): EngineState | null => native?.getEngineState() ?? null,
  protectionOn: (): boolean => native?.isProtectionEnabled() ?? false,
  openAccessibilitySettings: () => native?.openAccessibilitySettings(),
  batteryOk: (): boolean => native?.isIgnoringBatteryOptimizations() ?? true,
  openBatterySettings: () => native?.openBatterySettings(),
  openAutostartSettings: (): boolean => native?.openAutostartSettings() ?? false,
  manufacturer: (): string => native?.manufacturer() ?? "",
};
