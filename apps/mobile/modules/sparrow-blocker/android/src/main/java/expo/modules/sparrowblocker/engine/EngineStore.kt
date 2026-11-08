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
    )
  }

  fun saveState(s: EngineState) {
    prefs.edit()
      .putString("session", s.sessionId)
      .putLong("ends", s.endsAtMs)
      .putStringSet("packages", HashSet(s.packages))
      .putString("task", s.task)
      .putLong("syncedAt", System.currentTimeMillis())
      .apply()
  }

  fun lastSyncMs(): Long = prefs.getLong("syncedAt", 0L)

  /** Extra apps the person never wants blocked (beyond BlockRules.ALWAYS_ALLOWED). */
  fun alsoAllowed(): Set<String> = prefs.getStringSet("alsoAllowed", emptySet())?.toSet() ?: emptySet()

  fun saveAlsoAllowed(list: Collection<String>) {
    prefs.edit().putStringSet("alsoAllowed", HashSet(list)).apply()
  }

  /** "signed_out" when the server refused the secret (e.g. another sign-in replaced it). */
  fun status(): String = prefs.getString("status", "ok") ?: "ok"

  fun saveStatus(s: String) {
    prefs.edit().putString("status", s).apply()
  }
}
