package expo.modules.sparrowblocker.engine

/**
 * M5b-5: pure rules for website blocking on the phone (no Android imports), so they run in plain
 * JVM tests like BlockRules. SparrowVpnService feeds it the DNS questions the phone asks during a
 * focus session; a listed site gets "no such name", everything else is passed on untouched.
 *
 * Only DNS questions ever reach Sparrow (the VPN routes one made-up address, [VPN_DNS], and nothing
 * else), so it never sees pages, addresses of pages or any other traffic.
 */
object DnsRules {
  /** Private addresses that exist only inside the phone. */
  const val VPN_ADDRESS = "10.111.222.1"
  const val VPN_DNS = "10.111.222.2"

  private const val IP_HEADER = 20
  private const val UDP_HEADER = 8
  private const val DNS_HEADER = 12

  /** One DNS question as it arrived from the phone. [name] is lower-case without a trailing dot. */
  class Query(
    val srcIp: ByteArray,
    val dstIp: ByteArray,
    val srcPort: Int,
    val dstPort: Int,
    val dns: ByteArray,
    val name: String,
  )

  /** True when web blocking has something to do right now. */
  fun wanted(state: EngineState, nowMs: Long): Boolean = state.endsAtMs > nowMs && state.domains.isNotEmpty()

  /** A listed domain covers itself and everything under it (youtube.com covers m.youtube.com). */
  fun isBlocked(name: String?, domains: Set<String>): Boolean {
    val n = name?.trim()?.trimEnd('.')?.lowercase() ?: return false
    if (n.isEmpty()) return false
    return domains.any { d -> d.isNotEmpty() && (n == d || n.endsWith(".$d")) }
  }

  /**
   * Sparrow's own server is never blocked, whatever the list says, or the phone could not hear
   * that the session ended.
   */
  fun effectiveDomains(domains: Collection<String>, serverHost: String?): Set<String> {
    val host = serverHost?.trim()?.lowercase().orEmpty()
    return domains
      .map { it.trim().trimEnd('.').lowercase() }
      .filter { it.isNotEmpty() && it.contains('.') }
      .filter { d -> host.isEmpty() || !(host == d || host.endsWith(".$d")) }
      .toSet()
  }

  /** Host part of the Supabase URL ("https://abc.supabase.co/" gives "abc.supabase.co"). */
  fun hostOf(url: String?): String? {
    val s = url?.trim()?.lowercase() ?: return null
    val rest = s.substringAfter("://", s).substringBefore('/').substringBefore(':')
    return rest.takeIf { it.isNotEmpty() }
  }

  private fun u8(b: ByteArray, i: Int): Int = b[i].toInt() and 0xff

  private fun u16(b: ByteArray, i: Int): Int = (u8(b, i) shl 8) or u8(b, i + 1)

  /**
   * Reads one packet from the VPN. Returns null for anything that is not a whole IPv4 UDP DNS
   * question to port 53 (those packets are dropped: nothing else is routed to Sparrow anyway).
   */
  fun parseQuery(packet: ByteArray, length: Int): Query? {
    if (length < IP_HEADER + UDP_HEADER + DNS_HEADER || length > packet.size) return null
    if ((u8(packet, 0) shr 4) != 4) return null
    val ihl = (u8(packet, 0) and 0x0f) * 4
    if (ihl < IP_HEADER) return null
    if (u8(packet, 9) != 17) return null // UDP only
    if ((u16(packet, 6) and 0x3fff) != 0) return null // fragments
    val total = minOf(u16(packet, 2), length)
    if (total < ihl + UDP_HEADER + DNS_HEADER) return null
    val dstPort = u16(packet, ihl + 2)
    if (dstPort != 53) return null
    val udpLen = u16(packet, ihl + 4)
    if (udpLen < UDP_HEADER + DNS_HEADER || ihl + udpLen > total) return null
    val dns = packet.copyOfRange(ihl + UDP_HEADER, ihl + udpLen)
    val name = questionName(dns) ?: return null
    return Query(
      srcIp = packet.copyOfRange(12, 16),
      dstIp = packet.copyOfRange(16, 20),
      srcPort = u16(packet, ihl),
      dstPort = dstPort,
      dns = dns,
      name = name,
    )
  }

  /** Offset just past the first question (name, type, class), or -1 when the message is not a plain question. */
  private fun questionEnd(dns: ByteArray): Int {
    if (dns.size < DNS_HEADER) return -1
    if ((u8(dns, 2) and 0x80) != 0) return -1 // an answer, not a question
    if (u16(dns, 4) < 1) return -1
    var i = DNS_HEADER
    var nameLen = 0
    while (true) {
      if (i >= dns.size) return -1
      val len = u8(dns, i)
      if (len == 0) {
        i++
        break
      }
      if ((len and 0xc0) != 0) return -1 // pointers don't belong in a question
      nameLen += len + 1
      if (nameLen > 254) return -1
      i += len + 1
    }
    return if (i + 4 <= dns.size) i + 4 else -1
  }

  /** The name being asked for, lower-case ("" for the root), or null when the message is malformed. */
  fun questionName(dns: ByteArray): String? {
    if (questionEnd(dns) < 0) return null
    val sb = StringBuilder()
    var i = DNS_HEADER
    while (true) {
      val len = u8(dns, i)
      if (len == 0) break
      if (sb.isNotEmpty()) sb.append('.')
      for (k in 1..len) {
        val c = u8(dns, i + k)
        if (c < 0x21 || c > 0x7e || c == '.'.code) return null
        sb.append(c.toChar().lowercaseChar())
      }
      i += len + 1
    }
    return sb.toString()
  }

  /** The answer for a listed site: the same question back, marked "no such name". Null if the question is malformed. */
  fun refusal(dns: ByteArray): ByteArray? {
    val end = questionEnd(dns)
    if (end < 0) return null
    val out = dns.copyOfRange(0, end)
    out[2] = ((u8(dns, 2) and 0x79) or 0x80).toByte() // answer; keep the opcode and "recursion desired"
    out[3] = 0x83.toByte() // recursion available, NXDOMAIN
    out[4] = 0
    out[5] = 1 // one question
    for (k in 6..11) out[k] = 0 // no answers, authority or extra records
    return out
  }

  /** Wraps a DNS message in IPv4 + UDP so it can be written back to the phone. */
  fun udpPacket(srcIp: ByteArray, srcPort: Int, dstIp: ByteArray, dstPort: Int, payload: ByteArray): ByteArray {
    require(srcIp.size == 4 && dstIp.size == 4) { "IPv4 only" }
    val total = IP_HEADER + UDP_HEADER + payload.size
    require(total <= 0xffff) { "too large" }
    val p = ByteArray(total)
    p[0] = 0x45
    p[2] = (total shr 8).toByte()
    p[3] = total.toByte()
    p[6] = 0x40 // don't fragment
    p[8] = 64 // time to live
    p[9] = 17 // UDP
    System.arraycopy(srcIp, 0, p, 12, 4)
    System.arraycopy(dstIp, 0, p, 16, 4)
    var sum = 0
    for (i in 0 until IP_HEADER step 2) sum += u16(p, i)
    while ((sum shr 16) != 0) sum = (sum and 0xffff) + (sum shr 16)
    val check = sum.inv() and 0xffff
    p[10] = (check shr 8).toByte()
    p[11] = check.toByte()
    val udpLen = UDP_HEADER + payload.size
    p[20] = (srcPort shr 8).toByte()
    p[21] = srcPort.toByte()
    p[22] = (dstPort shr 8).toByte()
    p[23] = dstPort.toByte()
    p[24] = (udpLen shr 8).toByte()
    p[25] = udpLen.toByte()
    // UDP checksum 0 = "not used", which IPv4 allows.
    System.arraycopy(payload, 0, p, IP_HEADER + UDP_HEADER, payload.size)
    return p
  }

  /** The reply to [q], addressed back to whoever asked. */
  fun reply(q: Query, dnsAnswer: ByteArray): ByteArray = udpPacket(q.dstIp, q.dstPort, q.srcIp, q.srcPort, dnsAnswer)

  /** How long to wait for the phone's real DNS server before trying the next one. */
  const val UPSTREAM_TIMEOUT_MS = 4_000

  /** Re-read the phone's DNS servers this often, so moving between Wi-Fi and mobile data keeps working. */
  const val UPSTREAM_REFRESH_MS = 15_000L
}
