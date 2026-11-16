package expo.modules.sparrowblocker.engine

/**
 * Pure rules for key requests on the key holder's phone (ROADMAP T3.2, DECISIONS D46). No Android imports, so
 * they run in plain JVM tests (run-jvm-tests.sh).
 *
 * device_sync() lists the requests waiting on this phone's owner (migration 0032). The phone posts one
 * notification per new request and takes back the ones that were answered elsewhere or ran out.
 */
object KeyRequests {
  const val ACTION_LET_OUT = "expo.modules.sparrowblocker.KEY_LET_OUT"
  const val ACTION_CONFIRM = "expo.modules.sparrowblocker.KEY_CONFIRM_LET_OUT"
  const val ACTION_KEEP_GOING = "expo.modules.sparrowblocker.KEY_KEEP_GOING"
  const val EXTRA_REQUEST = "request"

  private val UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

  /** Only well-formed request ids are ever acted on (the list comes from the network). */
  fun isRequestId(s: String?): Boolean = s != null && UUID.matches(s)

  data class Plan(val show: List<String>, val cancel: List<String>)

  /**
   * What to change on screen: post the requests not shown yet, take back the ones no longer waiting.
   * [waiting] keeps the server's order; anything that isn't a request id is ignored.
   */
  fun plan(waiting: List<String>, shown: Set<String>): Plan {
    val valid = waiting.filter { isRequestId(it) }.distinct()
    return Plan(show = valid.filter { it !in shown }, cancel = shown.filter { it !in valid }.sorted())
  }

  /**
   * A stable notification id per request, in its own range (high byte 0x5A) so it never collides with other
   * notifications, and the same request always replaces its own notification (the confirm step reuses it).
   */
  fun notificationId(requestId: String): Int = 0x5A000000 or (requestId.lowercase().hashCode() and 0x00FFFFFF)

  /** What a tap on a notification button does: ask again first for "Let them out", send for the other two. */
  enum class Step { ASK_TO_CONFIRM, SEND_APPROVE, SEND_DENY, IGNORE }

  fun stepFor(action: String?, requestId: String?): Step {
    if (!isRequestId(requestId)) return Step.IGNORE
    return when (action) {
      ACTION_LET_OUT -> Step.ASK_TO_CONFIRM
      ACTION_CONFIRM -> Step.SEND_APPROVE
      ACTION_KEEP_GOING -> Step.SEND_DENY
      else -> Step.IGNORE
    }
  }
}
