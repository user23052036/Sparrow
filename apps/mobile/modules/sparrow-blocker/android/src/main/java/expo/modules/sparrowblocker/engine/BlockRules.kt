package expo.modules.sparrowblocker.engine

/**
 * Pure blocking rules (no Android imports), so they run in plain JVM tests
 * (see src/test and apps/mobile/modules/sparrow-blocker/android/run-jvm-tests.sh).
 *
 * The phone keeps a local copy of the running session so blocking works offline and
 * after a restart; it expires by itself at [EngineState.endsAtMs] on the phone's clock.
 */
object BlockRules {
  /**
   * Never blocked, whatever the list says: Sparrow, phone, messages, emergency, Settings
   * (so protection can always be switched off: friction, not a prison, see DECISIONS D6),
   * and the system UI. MUST match ALWAYS_ALLOWED_PACKAGES in packages/shared/src/blocklist.ts
   * (a shared test compares the two lists).
   */
  val ALWAYS_ALLOWED: Set<String> = setOf(
    "com.sparrow.app",
    "com.android.dialer",
    "com.google.android.dialer",
    "com.samsung.android.dialer",
    "com.android.server.telecom",
    "com.android.emergency",
    "com.google.android.apps.messaging",
    "com.android.mms",
    "com.samsung.android.messaging",
    "com.android.settings",
    "com.android.systemui",
  )

  /** True when [pkg] should be covered by the blocked screen right now. */
  fun shouldBlock(state: EngineState, pkg: String?, nowMs: Long, alsoAllowed: Set<String> = emptySet()): Boolean {
    if (pkg.isNullOrBlank()) return false
    if (!state.isActive(nowMs)) return false
    if (pkg in ALWAYS_ALLOWED || pkg in alsoAllowed) return false
    return pkg in state.packages
  }

  /**
   * Turns a device_sync() answer into local state. The server's ends_at is moved onto the
   * phone's clock using the server time in the same answer, so a phone clock that is minutes
   * off still ends the session on time.
   */
  fun fromSync(
    serverNowMs: Long,
    localNowMs: Long,
    active: Boolean,
    endsAtServerMs: Long?,
    packages: Collection<String>,
    task: String?,
    sessionId: String?,
    domains: Collection<String> = emptyList(),
  ): EngineState {
    if (!active || endsAtServerMs == null) return EngineState.IDLE
    val skew = serverNowMs - localNowMs
    return EngineState(
      sessionId = sessionId,
      endsAtMs = endsAtServerMs - skew,
      packages = packages.filter { it.isNotBlank() }.toSet(),
      task = task?.takeIf { it.isNotBlank() },
      domains = domains.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet(),
    )
  }

  private val ISO = Regex("""^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$""")

  /** Parses Postgres/ISO timestamps like 2026-11-09T10:00:00.123456+00:00 to epoch millis (no java.time, works on old Android). */
  fun parseIsoMillis(s: String?): Long? {
    val m = ISO.matchEntire(s?.trim() ?: return null) ?: return null
    val (y, mo, d, h, mi, se) = m.destructured
    val frac = m.groupValues[7]
    val zone = m.groupValues[8]
    val days = daysFromCivil(y.toInt(), mo.toInt(), d.toInt())
    var ms = ((days * 24 + h.toLong()) * 60 + mi.toLong()) * 60_000 + se.toLong() * 1000
    if (frac.isNotEmpty()) ms += (frac + "00").substring(0, 3).toLong()
    if (zone != "Z") {
      val sign = if (zone[0] == '-') -1 else 1
      val digits = zone.substring(1).replace(":", "")
      val offH = digits.substring(0, 2).toInt()
      val offM = if (digits.length >= 4) digits.substring(2, 4).toInt() else 0
      ms -= sign * (offH * 60 + offM) * 60_000L
    }
    return ms
  }

  // Howard Hinnant's days_from_civil.
  private fun daysFromCivil(y0: Int, m: Int, d: Int): Long {
    val y = if (m <= 2) y0 - 1 else y0
    val era = (if (y >= 0) y else y - 399) / 400
    val yoe = y - era * 400
    val mp = (m + 9) % 12
    val doy = (153 * mp + 2) / 5 + d - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097L + doe - 719468L
  }

  /** How often the service talks to the server. Matches the extension's 30 s poll (D10). */
  const val SYNC_EVERY_MS = 30_000L

  /** The server logs "went quiet" after 3 minutes without a heartbeat; stay well inside that. */
  const val HEARTBEAT_EVERY_MS = 60_000L

  /** Don't cover the same app again within this window (avoids flicker loops with the blocked screen). */
  const val REBLOCK_GAP_MS = 1_500L
}

data class EngineState(
  val sessionId: String?,
  val endsAtMs: Long,
  val packages: Set<String>,
  val task: String?,
  /** Sites to keep away in the phone's browsers (M5b-5); empty when web blocking has nothing to do. */
  val domains: Set<String> = emptySet(),
) {
  fun isActive(nowMs: Long): Boolean = endsAtMs > nowMs && (packages.isNotEmpty() || domains.isNotEmpty())

  companion object {
    val IDLE = EngineState(null, 0L, emptySet(), null)
  }
}
