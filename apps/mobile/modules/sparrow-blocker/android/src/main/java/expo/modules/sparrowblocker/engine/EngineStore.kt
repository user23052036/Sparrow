package expo.modules.sparrowblocker.engine

import android.content.Context
import android.content.SharedPreferences

/**
 * Local copy of what the blocker needs, kept in SharedPreferences so blocking keeps working
 * offline, after the app is swiped away and after a reboot (the service restarts by itself
 * when the accessibility setting is on). The device secret is a narrow credential: it can only
 * call device_sync() for this one phone (supabase/migrations/0020_android_engine.sql).
 */
class EngineStore(context: Context) {
  private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences("sparrow_engine", Context.MODE_PRIVATE)

  data class Config(val url: String, val anonKey: String, val deviceId: String, val secret: String)

  fun config(): Config? {
    val url = prefs.getString("url", null) ?: return null
    val key = prefs.getString("anon", null) ?: return null
    val id = prefs.getString("device", null) ?: return null
    val secret = prefs.getString("secret", null) ?: return null
    return Config(url, key, id, secret)
  }

  fun saveConfig(c: Config) {
    prefs.edit().putString("url", c.url.trimEnd('/')).putString("anon", c.anonKey).putString("device", c.deviceId).putString("secret", c.secret).apply()
  }

  /** Signing out forgets the credential and any running session. */
  fun clear() {
    prefs.edit().clear().apply()
  }

  fun state(): EngineState {
    val ends = prefs.getLong("ends", 0L)
    if (ends == 0L) return EngineState.IDLE
    return EngineState(
      sessionId = prefs.getString("session", null),
      endsAtMs = ends,
      packages = prefs.getStringSet("packages", emptySet())?.toSet() ?: emptySet(),
      task = prefs.getString("task", null),
      domains = prefs.getStringSet("domains", emptySet())?.toSet() ?: emptySet(),
    )
  }

  fun saveState(s: EngineState) {
    prefs.edit()
      .putString("session", s.sessionId)
      .putLong("ends", s.endsAtMs)
      .putStringSet("packages", HashSet(s.packages))
      .putString("task", s.task)
      .putStringSet("domains", HashSet(s.domains))
      .putLong("syncedAt", System.currentTimeMillis())
      .apply()
  }

  fun lastSyncMs(): Long = prefs.getLong("syncedAt", 0L)

  /** Extra apps the person never wants blocked (beyond BlockRules.ALWAYS_ALLOWED). */
  fun alsoAllowed(): Set<String> = prefs.getStringSet("alsoAllowed", emptySet())?.toSet() ?: emptySet()

  fun saveAlsoAllowed(list: Collection<String>) {
    prefs.edit().putStringSet("alsoAllowed", HashSet(list)).apply()
  }

  /** M5b-5: the person switched on website blocking on this phone (off by default). */
  fun webBlocking(): Boolean = prefs.getBoolean("webBlocking", false)

  fun saveWebBlocking(on: Boolean) {
    prefs.edit().putBoolean("webBlocking", on).apply()
  }

  /** T3.3: when the background service (not the open app) last checked in, on this phone's clock. */
  fun serviceSyncMs(): Long = prefs.getLong("serviceSyncedAt", 0L)

  fun saveServiceSync(ms: Long) {
    prefs.edit().putLong("serviceSyncedAt", ms).apply()
  }

  /** T3.3: server clock minus phone clock, from the last check-in. */
  fun serverOffsetMs(): Long = prefs.getLong("serverOffset", 0L)

  fun saveServerOffset(ms: Long) {
    prefs.edit().putLong("serverOffset", ms).apply()
  }

  /** T3.3: when the blocked screen last actually showed over a listed app ("Check my setup" looks for it). */
  fun lastCoverMs(): Long = prefs.getLong("lastCover", 0L)

  fun saveLastCover(ms: Long) {
    prefs.edit().putLong("lastCover", ms).apply()
  }

  /** T3.2: key requests the last sync listed as waiting on this phone's owner, and the ones already on screen. */
  fun waitingRequests(): List<String> = prefs.getString("keyWaiting", "")!!.split(',').filter { it.isNotBlank() }

  fun saveWaitingRequests(ids: List<String>) {
    prefs.edit().putString("keyWaiting", ids.joinToString(",")).apply()
  }

  fun shownRequests(): Set<String> = prefs.getStringSet("keyShown", emptySet())?.toSet() ?: emptySet()

  fun saveShownRequests(ids: Set<String>) {
    prefs.edit().putStringSet("keyShown", HashSet(ids)).apply()
  }

  /** "signed_out" when the server refused the secret (e.g. another sign-in replaced it). */
  fun status(): String = prefs.getString("status", "ok") ?: "ok"

  fun saveStatus(s: String) {
    prefs.edit().putString("status", s).apply()
  }
}
