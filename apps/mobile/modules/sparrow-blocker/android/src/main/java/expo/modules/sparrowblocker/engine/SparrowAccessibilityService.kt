package expo.modules.sparrowblocker.engine

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * M5b-2 / M5b-4: the blocking engine.
 *
 * What it reads: only the package name of the app that comes to the foreground
 * (TYPE_WINDOW_STATE_CHANGED). It does not read screen content, text or keystrokes
 * (canRetrieveWindowContent is false in res/xml/sparrow_accessibility.xml).
 *
 * What it does: during a focus session, if that app is on the person's list, it shows
 * Sparrow's calm blocked screen on top. It also syncs with the server every 30 s while the
 * screen is on (this is the heartbeat and how a session started on the laptop reaches the
 * phone), tells the server "asleep" when the screen goes off during a session, and reports
 * "protection off" when the service is switched off.
 */
class SparrowAccessibilityService : AccessibilityService() {
  private val io = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private lateinit var store: EngineStore
  private var allowed: Set<String> = emptySet()
  private var currentPkg: String? = null
  private var lastCover: Pair<String, Long>? = null
  private var screenOn = true
  private var receiverOn = false
  private val syncing = AtomicBoolean(false)

  private val tick = object : Runnable {
    override fun run() {
      syncAsync(asleep = false)
      if (screenOn) main.postDelayed(this, BlockRules.SYNC_EVERY_MS)
    }
  }

  private val screen = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_SCREEN_OFF -> {
          screenOn = false
          main.removeCallbacks(tick)
          // Say "asleep" before Android starts delaying network calls, so a phone in a pocket isn't logged as going quiet.
          syncAsync(asleep = true)
        }
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
          if (!screenOn) {
            screenOn = true
            main.removeCallbacks(tick)
            main.post(tick)
          }
        }
      }
    }
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    running = true
    store = EngineStore(this)
    allowed = AllowedApps.defaults(this)
    if (!receiverOn) {
      val f = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_USER_PRESENT)
      }
      registerReceiver(screen, f)
      receiverOn = true
    }
    main.removeCallbacks(tick)
    main.post(tick)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    currentPkg = pkg
    if (pkg == packageName) return // our own screens, including the blocked screen, are never covered
    evaluate(pkg)
    if (System.currentTimeMillis() - store.lastSyncMs() > BlockRules.SYNC_EVERY_MS) syncAsync(asleep = false)
  }

  private fun evaluate(pkg: String) {
    val now = System.currentTimeMillis()
    val state = store.state()
    if (!BlockRules.shouldBlock(state, pkg, now, allowed + store.alsoAllowed())) return
    val last = lastCover
    if (last != null && last.first == pkg && now - last.second < BlockRules.REBLOCK_GAP_MS) return
    lastCover = pkg to now
    startActivity(BlockedActivity.intent(this, pkg, state.task, state.endsAtMs))
  }

  private fun syncAsync(asleep: Boolean) {
    // One call at a time; an "asleep" report always goes through so the server hears it before the network sleeps.
    if (!syncing.compareAndSet(false, true) && !asleep) return
    io.execute {
      try {
        SyncClient.sync(store, protection = true, asleep = asleep)
      } catch (ignored: SyncClient.SignedOut) {
        // The app shows "sign in again" next time it opens; keep enforcing the last state until it ends.
      } finally {
        syncing.set(false)
      }
      // A session that just arrived should cover the app that is already open.
      main.post { currentPkg?.let { if (screenOn) evaluate(it) } }
    }
  }

  override fun onInterrupt() {}

  override fun onUnbind(intent: Intent?): Boolean {
    stopAndReport()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    stopAndReport()
    io.shutdown()
    super.onDestroy()
  }

  private fun stopAndReport() {
    if (!running) return
    running = false
    main.removeCallbacks(tick)
    if (receiverOn) {
      try {
        unregisterReceiver(screen)
      } catch (ignored: Exception) {}
      receiverOn = false
    }
    // Best effort: the process may be stopped right after this, so use a plain thread.
    val s = store
    Thread {
      try {
        SyncClient.sync(s, protection = false, asleep = false)
      } catch (ignored: Exception) {}
    }.start()
  }

  companion object {
    /** True while the system has the service connected (used by the app's setup screen). */
    @Volatile
    var running: Boolean = false
      private set
  }
}
