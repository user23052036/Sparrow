package expo.modules.sparrowblocker.engine

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

object KeyRequestsTest {
  private const val A = "11111111-1111-4111-8111-111111111111"
  private const val B = "22222222-2222-4222-8222-222222222222"
  private const val C = "33333333-3333-4333-8333-333333333333"

  @JvmStatic
  fun main(args: Array<String>) {
    // New requests are posted once; answered ones are taken back.
    assertEquals(KeyRequests.Plan(show = listOf(A, B), cancel = emptyList()), KeyRequests.plan(listOf(A, B), emptySet()))
    assertEquals(KeyRequests.Plan(show = listOf(B), cancel = emptyList()), KeyRequests.plan(listOf(A, B), setOf(A)))
    assertEquals(KeyRequests.Plan(show = emptyList(), cancel = listOf(A, C)), KeyRequests.plan(listOf(B), setOf(C, A, B)))
    assertEquals(KeyRequests.Plan(show = emptyList(), cancel = listOf(A)), KeyRequests.plan(emptyList(), setOf(A)))
    // Junk from the network is never shown, and a repeated id is shown once.
    assertEquals(listOf(A), KeyRequests.plan(listOf("", "drop table", A, A), emptySet()).show)

    // Ids: stable, in Sparrow's own range, different per request, same whatever the case.
    assertEquals(KeyRequests.notificationId(A), KeyRequests.notificationId(A))
    assertEquals(KeyRequests.notificationId(A), KeyRequests.notificationId(A.uppercase()))
    assertNotEquals(KeyRequests.notificationId(A), KeyRequests.notificationId(B))
    for (id in listOf(A, B, C)) assertEquals(0x5A, KeyRequests.notificationId(id) ushr 24)

    // "Let them out" always asks once more; "Keep going" and the confirmation send; anything else does nothing.
    assertEquals(KeyRequests.Step.ASK_TO_CONFIRM, KeyRequests.stepFor(KeyRequests.ACTION_LET_OUT, A))
    assertEquals(KeyRequests.Step.SEND_APPROVE, KeyRequests.stepFor(KeyRequests.ACTION_CONFIRM, A))
    assertEquals(KeyRequests.Step.SEND_DENY, KeyRequests.stepFor(KeyRequests.ACTION_KEEP_GOING, A))
    assertEquals(KeyRequests.Step.IGNORE, KeyRequests.stepFor("something.else", A))
    assertEquals(KeyRequests.Step.IGNORE, KeyRequests.stepFor(KeyRequests.ACTION_CONFIRM, "not-an-id"))
    assertEquals(KeyRequests.Step.IGNORE, KeyRequests.stepFor(KeyRequests.ACTION_CONFIRM, null))
    assertTrue(KeyRequests.isRequestId(A))
    assertFalse(KeyRequests.isRequestId("$A "))

    println("KeyRequestsTest: all passed")
  }
}
