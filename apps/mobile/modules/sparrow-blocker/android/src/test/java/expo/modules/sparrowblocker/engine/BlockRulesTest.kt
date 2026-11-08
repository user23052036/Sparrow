package expo.modules.sparrowblocker.engine

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Plain JVM tests for the blocking rules. Run: android/run-jvm-tests.sh (needs kotlinc). */
object BlockRulesTest {
  private const val NOW = 1_800_000_000_000L
  private val session = EngineState("s1", NOW + 25 * 60_000, setOf("com.instagram.android", "com.android.dialer"), "Write 200 words")

  private val tests: List<Pair<String, () -> Unit>> = listOf(
    "blocks a listed app during a session" to { assertTrue(BlockRules.shouldBlock(session, "com.instagram.android", NOW)) },
    "does not block an app that is not listed" to { assertFalse(BlockRules.shouldBlock(session, "com.spotify.music", NOW)) },
    "never blocks always-allowed apps even if listed" to { assertFalse(BlockRules.shouldBlock(session, "com.android.dialer", NOW)) },
    "never blocks Settings, so protection can always be switched off" to {
      assertFalse(BlockRules.shouldBlock(session.copy(packages = setOf("com.android.settings")), "com.android.settings", NOW))
    },
    "respects the person's own always-allowed apps" to {
      assertFalse(BlockRules.shouldBlock(session, "com.instagram.android", NOW, setOf("com.instagram.android")))
    },
    "stops blocking when the session time is up, offline" to {
      assertFalse(BlockRules.shouldBlock(session, "com.instagram.android", session.endsAtMs))
      assertTrue(BlockRules.shouldBlock(session, "com.instagram.android", session.endsAtMs - 1))
    },
    "idle state blocks nothing" to { assertFalse(BlockRules.shouldBlock(EngineState.IDLE, "com.instagram.android", NOW)) },
    "null or blank packages are ignored" to {
      assertFalse(BlockRules.shouldBlock(session, null, NOW))
      assertFalse(BlockRules.shouldBlock(session, " ", NOW))
    },
    "moves the server end time onto the phone clock" to {
      // phone clock is 2 minutes behind the server
      val st = BlockRules.fromSync(serverNowMs = NOW, localNowMs = NOW - 120_000, active = true, endsAtServerMs = NOW + 600_000,
        packages = listOf("a.b", ""), task = "  ", sessionId = "s")
      assertEquals(NOW - 120_000 + 600_000, st.endsAtMs)
      assertEquals(setOf("a.b"), st.packages)
      assertNull(st.task)
    },
    "an inactive answer clears the session" to {
      assertEquals(EngineState.IDLE, BlockRules.fromSync(NOW, NOW, false, NOW + 1000, listOf("a.b"), null, null))
    },
    "parses Postgres timestamps" to {
      assertEquals(0L, BlockRules.parseIsoMillis("1970-01-01T00:00:00Z"))
      assertEquals(1_762_682_400_123L, BlockRules.parseIsoMillis("2025-11-09T10:00:00.123456+00:00"))
      assertEquals(1_762_682_400_000L, BlockRules.parseIsoMillis("2025-11-09T15:30:00+05:30"))
      assertEquals(1_762_682_400_000L, BlockRules.parseIsoMillis("2025-11-09 05:00:00-05"))
      assertEquals(951_782_400_000L, BlockRules.parseIsoMillis("2000-02-29T00:00:00Z"))
      assertNull(BlockRules.parseIsoMillis("yesterday"))
      assertNull(BlockRules.parseIsoMillis(null))
    },
    "syncs often enough that the server never sees a 3-minute silence" to {
      assertTrue(BlockRules.HEARTBEAT_EVERY_MS * 2 < 3 * 60_000)
      assertTrue(BlockRules.SYNC_EVERY_MS <= BlockRules.HEARTBEAT_EVERY_MS)
    },
  )

  @JvmStatic
  fun main(args: Array<String>) {
    var failed = 0
    for ((name, body) in tests) {
      try {
        body()
        println("ok   $name")
      } catch (e: AssertionError) {
        failed++
        println("FAIL $name: ${e.message}")
      }
    }
    println(if (failed == 0) "ALL ${tests.size} JVM TESTS PASSED" else "$failed FAILED")
    if (failed > 0) kotlin.system.exitProcess(1)
  }
}
