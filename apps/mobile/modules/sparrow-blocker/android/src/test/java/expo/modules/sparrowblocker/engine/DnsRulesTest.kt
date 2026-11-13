package expo.modules.sparrowblocker.engine

import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Plain JVM tests for the website-blocking rules (M5b-5). Run: android/run-jvm-tests.sh (needs kotlinc). */
object DnsRulesTest {
  private const val NOW = 1_800_000_000_000L
  private val list = setOf("youtube.com", "reddit.com")

  /** A DNS question for [name] (type A, class IN), optionally followed by an EDNS record like real resolvers send. */
  private fun question(name: String, id: Int = 0x1234, edns: Boolean = false): ByteArray {
    val out = ArrayList<Byte>()
    fun b(vararg v: Int) = v.forEach { out.add(it.toByte()) }
    b(id shr 8, id and 0xff, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, if (edns) 1 else 0)
    if (name.isNotEmpty()) for (label in name.split('.')) {
      b(label.length)
      label.forEach { b(it.code) }
    }
    b(0, 0, 1, 0, 1)
    if (edns) b(0, 0, 41, 0x10, 0, 0, 0, 0, 0, 0, 0)
    return out.toByteArray()
  }

  private val phone = byteArrayOf(10, 111, 222.toByte(), 1)
  private val dns = byteArrayOf(10, 111, 222.toByte(), 2)

  private fun packet(payload: ByteArray, dstPort: Int = 53) = DnsRules.udpPacket(phone, 40000, dns, dstPort, payload)

  private fun u16(b: ByteArray, i: Int) = ((b[i].toInt() and 0xff) shl 8) or (b[i + 1].toInt() and 0xff)

  private val tests: List<Pair<String, () -> Unit>> = listOf(
    "a listed site and everything under it is blocked" to {
      assertTrue(DnsRules.isBlocked("youtube.com", list))
      assertTrue(DnsRules.isBlocked("m.youtube.com", list))
      assertTrue(DnsRules.isBlocked("WWW.YouTube.com.", list))
    },
    "look-alike and unlisted names are not blocked" to {
      assertFalse(DnsRules.isBlocked("notyoutube.com", list))
      assertFalse(DnsRules.isBlocked("youtube.com.example.org", list))
      assertFalse(DnsRules.isBlocked("wikipedia.org", list))
      assertFalse(DnsRules.isBlocked("com", list))
      assertFalse(DnsRules.isBlocked("", list))
      assertFalse(DnsRules.isBlocked(null, list))
    },
    "Sparrow's own server is never blocked, whatever the list says" to {
      assertEquals(setOf("reddit.com"), DnsRules.effectiveDomains(listOf("supabase.co", "Reddit.com ", "", "localhost"), "abc.supabase.co"))
      assertEquals(setOf("supabase.co", "reddit.com"), DnsRules.effectiveDomains(listOf("supabase.co", "reddit.com"), null))
      assertEquals("abc.supabase.co", DnsRules.hostOf("https://ABC.supabase.co/"))
      assertEquals("localhost", DnsRules.hostOf("http://localhost:54321"))
      assertNull(DnsRules.hostOf(null))
    },
    "web blocking is wanted only during a session that has sites" to {
      val st = EngineState("s", NOW + 60_000, emptySet(), null, list)
      assertTrue(DnsRules.wanted(st, NOW))
      assertFalse(DnsRules.wanted(st, NOW + 60_000))
      assertFalse(DnsRules.wanted(st.copy(domains = emptySet()), NOW))
      assertFalse(DnsRules.wanted(EngineState.IDLE, NOW))
    },
    "a session with only sites is active but covers no app" to {
      val st = EngineState("s", NOW + 60_000, emptySet(), null, list)
      assertTrue(st.isActive(NOW))
      assertFalse(BlockRules.shouldBlock(st, "com.android.chrome", NOW))
    },
    "sync keeps the site list" to {
      val st = BlockRules.fromSync(NOW, NOW, true, NOW + 1000, listOf("a.b"), null, "s", listOf("YouTube.com", " "))
      assertEquals(setOf("youtube.com"), st.domains)
      assertEquals(emptySet(), BlockRules.fromSync(NOW, NOW, true, NOW + 1000, listOf("a.b"), null, "s").domains)
    },
    "reads the name out of a real-shaped DNS packet" to {
      val q = assertNotNull(DnsRules.parseQuery(packet(question("M.YouTube.com", edns = true)), 28 + question("M.YouTube.com", edns = true).size))
      assertEquals("m.youtube.com", q.name)
      assertEquals(40000, q.srcPort)
      assertEquals(53, q.dstPort)
      assertTrue(q.srcIp.contentEquals(phone))
      assertTrue(q.dstIp.contentEquals(dns))
    },
    "ignores packets that are not DNS questions" to {
      val p = packet(question("youtube.com"))
      assertNull(DnsRules.parseQuery(packet(question("youtube.com"), dstPort = 443), p.size)) // not port 53
      assertNull(DnsRules.parseQuery(p.copyOf().also { it[9] = 6 }, p.size)) // TCP
      assertNull(DnsRules.parseQuery(p.copyOf().also { it[0] = 0x60 }, p.size)) // IPv6
      assertNull(DnsRules.parseQuery(p.copyOf().also { it[6] = 0x20 }, p.size)) // fragment
      assertNull(DnsRules.parseQuery(p, 20)) // cut short
      assertNull(DnsRules.parseQuery(p, p.size + 1)) // longer than the buffer
      val answer = question("youtube.com").also { it[2] = 0x81.toByte() }
      assertNull(DnsRules.parseQuery(packet(answer), packet(answer).size)) // an answer, not a question
    },
    "malformed names never crash the reader" to {
      val q = question("youtube.com")
      assertNull(DnsRules.questionName(q.copyOf(15))) // name runs off the end
      assertNull(DnsRules.questionName(q.copyOf().also { it[12] = 0xc0.toByte() })) // pointer in a question
      assertNull(DnsRules.questionName(q.copyOf().also { it[5] = 0 })) // no question
      assertNull(DnsRules.questionName(ByteArray(5)))
      assertNull(DnsRules.refusal(q.copyOf(15)))
      assertEquals("", DnsRules.questionName(question("")))
      for (len in 0..q.size) DnsRules.questionName(q.copyOf(len)) // any truncation returns, never throws
    },
    "a listed site is answered with 'no such name' for the same question" to {
      val q = question("youtube.com", id = 0xbeef, edns = true)
      val r = assertNotNull(DnsRules.refusal(q))
      assertEquals(0xbeef, u16(r, 0)) // same id, so the phone accepts it
      assertEquals(0x81, r[2].toInt() and 0xff) // an answer, recursion desired kept
      assertEquals(3, r[3].toInt() and 0x0f) // NXDOMAIN
      assertEquals(1, u16(r, 4))
      assertEquals(0, u16(r, 6) + u16(r, 8) + u16(r, 10)) // no records, EDNS dropped
      assertEquals(question("youtube.com").size, r.size)
      assertTrue(r.copyOfRange(12, r.size).contentEquals(q.copyOfRange(12, r.size)))
    },
    "the reply goes back to whoever asked, with a valid IP checksum" to {
      val q = assertNotNull(DnsRules.parseQuery(packet(question("reddit.com")), packet(question("reddit.com")).size))
      val out = DnsRules.reply(q, assertNotNull(DnsRules.refusal(q.dns)))
      assertTrue(out.copyOfRange(12, 16).contentEquals(dns))
      assertTrue(out.copyOfRange(16, 20).contentEquals(phone))
      assertEquals(53, u16(out, 20))
      assertEquals(40000, u16(out, 22))
      assertEquals(out.size, u16(out, 2))
      assertEquals(out.size - 20, u16(out, 24))
      var sum = 0
      for (i in 0 until 20 step 2) sum += u16(out, i)
      while ((sum shr 16) != 0) sum = (sum and 0xffff) + (sum shr 16)
      assertEquals(0xffff, sum) // a correct header sums to all ones
    },
    "the made-up DNS address is the only thing routed to Sparrow" to {
      assertTrue(DnsRules.VPN_DNS.startsWith("10.") && DnsRules.VPN_ADDRESS.startsWith("10."))
      assertTrue(DnsRules.VPN_DNS != DnsRules.VPN_ADDRESS)
    },
  )

  @JvmStatic
  fun main(args: Array<String>) {
    var failed = 0
    for ((name, body) in tests) {
      try {
        body()
        println("ok   $name")
      } catch (e: Throwable) {
        failed++
        println("FAIL $name: $e")
      }
    }
    println(if (failed == 0) "ALL ${tests.size} DNS TESTS PASSED" else "$failed FAILED")
    if (failed > 0) kotlin.system.exitProcess(1)
  }
}
