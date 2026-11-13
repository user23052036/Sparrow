package expo.modules.sparrowblocker.engine

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import expo.modules.sparrowblocker.R
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * M5b-5: keeps listed websites away in the phone's browsers during a focus session.
 *
 * It is a "VPN" only in Android's sense: nothing leaves the phone through it. The only thing
 * routed to it is one made-up DNS address, so the only thing it ever sees is the phone asking
 * "where is example.com?". A listed site gets "no such name"; every other question is passed to
 * the DNS servers the phone was already using and the answer is handed straight back. Pages,
 * messages and all other traffic never pass through Sparrow, and nothing is logged or sent.
 *
 * It runs only while a session with listed sites is active and the person switched web blocking
 * on (off by default: Android allows one VPN at a time, so this replaces any other VPN while it runs).
 */
class SparrowVpnService : VpnService() {
  private val main = Handler(Looper.getMainLooper())
  @Volatile
  private var tun: ParcelFileDescriptor? = null
  private var reader: Thread? = null
  private var pool: ExecutorService? = null

  @Volatile
  private var domains: Set<String> = emptySet()

  @Volatile
  private var upstream: Upstream? = null

  private class Upstream(val network: Network?, val servers: List<InetAddress>, val readAtMs: Long)

  private val expiry = Runnable { applyState() }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      shutdown()
      stopSelf()
      return START_NOT_STICKY
    }
    return if (applyState()) START_STICKY else START_NOT_STICKY
  }

  /** Starts, refreshes or stops the filter from the saved session. Returns true while it should keep running. */
  private fun applyState(): Boolean {
    val store = EngineStore(this)
    val state = store.state()
    val now = System.currentTimeMillis()
    val list = DnsRules.effectiveDomains(state.domains, DnsRules.hostOf(store.config()?.url))
    if (!store.webBlocking() || state.endsAtMs <= now || list.isEmpty()) {
      shutdown()
      stopSelf()
      return false
    }
    domains = list
    if (tun == null && !open()) {
      stopSelf()
      return false
    }
    main.removeCallbacks(expiry)
    main.postDelayed(expiry, state.endsAtMs - now + 500)
    return true
  }

  private fun open(): Boolean {
    val fd = try {
      val b = Builder()
        .setSession(getString(R.string.sparrow_vpn_label))
        .addAddress(DnsRules.VPN_ADDRESS, 32)
        .addDnsServer(DnsRules.VPN_DNS)
        .addRoute(DnsRules.VPN_DNS, 32)
        .setBlocking(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) b.setMetered(false)
      b.establish()
    } catch (e: Exception) {
      null
    } ?: return false // not allowed yet (or anymore): the Protect tab shows how to allow it
    tun = fd
    pool = Executors.newFixedThreadPool(4)
    running = true
    reader = Thread({ readLoop(fd) }, "sparrow-dns").also { it.start() }
    return true
  }

  private fun readLoop(fd: ParcelFileDescriptor) {
    val input = FileInputStream(fd.fileDescriptor)
    val output = FileOutputStream(fd.fileDescriptor)
    val buf = ByteArray(32767)
    try {
      while (tun === fd) {
        val n = input.read(buf)
        if (n <= 0) continue
        val q = DnsRules.parseQuery(buf, n) ?: continue
        if (DnsRules.isBlocked(q.name, domains)) {
          DnsRules.refusal(q.dns)?.let { write(output, DnsRules.reply(q, it)) }
        } else {
          try {
            pool?.execute { forward(q)?.let { write(output, DnsRules.reply(q, it)) } }
          } catch (ignored: Exception) {
            // shutting down
          }
        }
      }
    } catch (ignored: Exception) {
      // the descriptor was closed: the filter is stopping
    }
  }

  private fun write(output: FileOutputStream, packet: ByteArray) {
    try {
      synchronized(output) { output.write(packet) }
    } catch (ignored: Exception) {}
  }

  /** Asks the DNS servers the phone was already using, outside the VPN. Null when none answered. */
  private fun forward(q: DnsRules.Query): ByteArray? {
    val up = currentUpstream()
    for (server in up.servers) {
      var socket: DatagramSocket? = null
      try {
        socket = DatagramSocket()
        protect(socket)
        try {
          up.network?.bindSocket(socket)
        } catch (ignored: Exception) {}
        socket.soTimeout = DnsRules.UPSTREAM_TIMEOUT_MS
        socket.send(DatagramPacket(q.dns, q.dns.size, server, 53))
        val answer = ByteArray(4096)
        val packet = DatagramPacket(answer, answer.size)
        socket.receive(packet)
        return answer.copyOf(packet.length)
      } catch (ignored: Exception) {
        upstream = null // read the servers again next time: the network may have changed
      } finally {
        socket?.close()
      }
    }
    return null
  }

  private fun currentUpstream(): Upstream {
    val now = System.currentTimeMillis()
    upstream?.let { if (now - it.readAtMs < DnsRules.UPSTREAM_REFRESH_MS) return it }
    val fresh = readUpstream(now)
    upstream = fresh
    return fresh
  }

  /** The DNS servers of the phone's real network (Wi-Fi before mobile data), never another VPN's. */
  private fun readUpstream(now: Long): Upstream {
    try {
      val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      var best: Network? = null
      var bestScore = -1
      for (n in cm.allNetworks) {
        val caps = cm.getNetworkCapabilities(n) ?: continue
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
        var score = 0
        if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) score += 4
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) score += 2
        if (score > bestScore) {
          best = n
          bestScore = score
        }
      }
      val servers = best?.let { cm.getLinkProperties(it)?.dnsServers }.orEmpty()
      if (best != null && servers.isNotEmpty()) return Upstream(best, servers, now)
    } catch (ignored: Exception) {}
    // The phone's own servers could not be read: fall back to two public resolvers.
    return Upstream(null, FALLBACK.map { InetAddress.getByAddress(it) }, now)
  }

  /** The person (or another VPN) switched this one off in Android's settings. */
  override fun onRevoke() {
    shutdown()
    super.onRevoke()
  }

  override fun onDestroy() {
    shutdown()
    super.onDestroy()
  }

  private fun shutdown() {
    main.removeCallbacks(expiry)
    running = false
    val fd = tun
    tun = null
    try {
      fd?.close()
    } catch (ignored: Exception) {}
    pool?.shutdownNow()
    pool = null
    reader?.interrupt() // if it is still waiting for a packet, it leaves at the next one at the latest
    reader = null
    upstream = null
  }

  companion object {
    private const val ACTION_APPLY = "expo.modules.sparrowblocker.VPN_APPLY"
    private const val ACTION_STOP = "expo.modules.sparrowblocker.VPN_STOP"
    private val FALLBACK = listOf(byteArrayOf(1, 1, 1, 1), byteArrayOf(8, 8, 8, 8))

    /** True while the filter is up. */
    @Volatile
    var running: Boolean = false
      private set

    /** Android's one-time "allow this VPN" question has been answered with yes. */
    fun allowed(ctx: Context): Boolean = try {
      prepare(ctx) == null
    } catch (e: Exception) {
      false
    }

    /**
     * Called after every sync (and when the switch changes): starts the filter when a session with
     * listed sites is running and web blocking is on and allowed, stops it otherwise.
     */
    fun apply(ctx: Context) {
      val store = EngineStore(ctx)
      val want = store.webBlocking() && DnsRules.wanted(store.state(), System.currentTimeMillis()) && allowed(ctx)
      if (!want && !running) return
      try {
        ctx.startService(Intent(ctx, SparrowVpnService::class.java).setAction(if (want) ACTION_APPLY else ACTION_STOP))
      } catch (ignored: Exception) {
        // Android refused a background start; the next sync or opening the app tries again
      }
    }
  }
}
