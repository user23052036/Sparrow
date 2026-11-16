package expo.modules.sparrowblocker.engine

import android.Manifest
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.os.Build
import expo.modules.sparrowblocker.R

/**
 * Posts key requests on the key holder's phone (ROADMAP T3.2, DECISIONS D46): one notification per request
 * device_sync() lists, with "Let them out" (asks once more) and "Keep going". Like Web Push (D38) it says only
 * that someone asked, never who or why: a lock screen is not private. Answering needs the phone unlocked, so
 * whoever picks up a locked phone can't let themselves out.
 */
object KeyRequestNotifier {
  private const val CHANNEL = "sparrow_key_requests"

  /** Brings the notifications in line with the requests the last sync listed. */
  fun update(context: Context) {
    val store = EngineStore(context)
    val nm = context.getSystemService(NotificationManager::class.java) ?: return
    // Signed out, or the server refused this phone: nothing it shows can be answered any more.
    if (store.config() == null || store.status() == "signed_out") {
      clearAll(context)
      return
    }
    val plan = KeyRequests.plan(store.waitingRequests(), store.shownRequests())
    plan.cancel.forEach { nm.cancel(KeyRequests.notificationId(it)) }
    if (!enabled(context)) {
      // Nothing can be shown yet; keep the new ones unshown so they appear once notifications are allowed.
      store.saveShownRequests(store.shownRequests() - plan.cancel.toSet())
      return
    }
    ensureChannel(context, nm)
    plan.show.forEach { nm.notify(KeyRequests.notificationId(it), ask(context, it)) }
    store.saveShownRequests(store.shownRequests() - plan.cancel.toSet() + plan.show)
  }

  /** The second step after "Let them out", in place of the first notification. */
  fun confirm(context: Context, requestId: String) {
    if (!stillShown(context, requestId)) return
    val n = builder(context)
      .setContentTitle(context.getString(R.string.sparrow_key_confirm_title))
      .setContentText(context.getString(R.string.sparrow_key_confirm_body))
      .addAction(action(context, requestId, KeyRequests.ACTION_CONFIRM, R.string.sparrow_key_confirm_yes))
      .addAction(action(context, requestId, KeyRequests.ACTION_KEEP_GOING, R.string.sparrow_key_keep_going))
      .build()
    post(context, requestId, n)
  }

  /** Asked again with the phone unlocked (older Android versions don't ask for the unlock themselves). */
  fun unlockFirst(context: Context, requestId: String) {
    if (!stillShown(context, requestId)) return
    val n = builder(context)
      .setContentTitle(context.getString(R.string.sparrow_key_title))
      .setContentText(context.getString(R.string.sparrow_key_unlock))
      .addAction(action(context, requestId, KeyRequests.ACTION_LET_OUT, R.string.sparrow_key_let_out))
      .addAction(action(context, requestId, KeyRequests.ACTION_KEEP_GOING, R.string.sparrow_key_keep_going))
      .build()
    post(context, requestId, n)
  }

  /** Signing out: every key request this phone shows goes away, and nothing is remembered. */
  fun clearAll(context: Context) {
    val store = EngineStore(context)
    val nm = context.getSystemService(NotificationManager::class.java)
    store.shownRequests().forEach { nm?.cancel(KeyRequests.notificationId(it)) }
    store.saveShownRequests(emptySet())
    store.saveWaitingRequests(emptyList())
  }

  /** The answer reached the server, or the request was already settled: the notification goes. */
  fun answered(context: Context, requestId: String) {
    context.getSystemService(NotificationManager::class.java)?.cancel(KeyRequests.notificationId(requestId))
  }

  /** The answer didn't get through (offline, or this phone was signed out): say so, without buttons. */
  fun notSent(context: Context, requestId: String) {
    if (!stillShown(context, requestId)) return
    val n = builder(context)
      .setContentTitle(context.getString(R.string.sparrow_key_title))
      .setContentText(context.getString(R.string.sparrow_key_not_sent))
      .build()
    post(context, requestId, n)
  }

  /** Sparrow may post notifications and the person hasn't silenced key requests (also used by the Protect screen). */
  fun enabled(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
    val nm = context.getSystemService(NotificationManager::class.java) ?: return false
    if (!nm.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT >= 26) {
      val ch = nm.getNotificationChannel(CHANNEL)
      if (ch != null && ch.importance == NotificationManager.IMPORTANCE_NONE) return false
    }
    return true
  }

  /** True while the screen is locked (the answer buttons then ask for an unlock first). */
  fun locked(context: Context): Boolean = context.getSystemService(KeyguardManager::class.java)?.isDeviceLocked ?: false

  /** Only a request this phone still shows may be redrawn: one answered or taken back meanwhile stays gone. */
  private fun stillShown(context: Context, requestId: String): Boolean =
    requestId in EngineStore(context).shownRequests() && enabled(context)

  private fun post(context: Context, requestId: String, n: Notification) {
    val nm = context.getSystemService(NotificationManager::class.java) ?: return
    ensureChannel(context, nm)
    nm.notify(KeyRequests.notificationId(requestId), n)
  }

  private fun ensureChannel(context: Context, nm: NotificationManager) {
    if (Build.VERSION.SDK_INT < 26 || nm.getNotificationChannel(CHANNEL) != null) return
    nm.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.sparrow_key_channel), NotificationManager.IMPORTANCE_HIGH))
  }

  private fun ask(context: Context, requestId: String): Notification =
    builder(context)
      .setContentTitle(context.getString(R.string.sparrow_key_title))
      .setContentText(context.getString(R.string.sparrow_key_body))
      .addAction(action(context, requestId, KeyRequests.ACTION_LET_OUT, R.string.sparrow_key_let_out))
      .addAction(action(context, requestId, KeyRequests.ACTION_KEEP_GOING, R.string.sparrow_key_keep_going))
      .build()

  @Suppress("DEPRECATION")
  private fun builder(context: Context): Notification.Builder {
    val b =
      if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL)
      else Notification.Builder(context).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL)
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (open != null) b.setContentIntent(PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    return b
      .setSmallIcon(R.drawable.sparrow_notification)
      .setCategory(Notification.CATEGORY_MESSAGE)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
  }

  private fun action(context: Context, requestId: String, what: String, label: Int): Notification.Action {
    val intent = Intent(context, KeyAnswerReceiver::class.java).setAction(what).putExtra(KeyRequests.EXTRA_REQUEST, requestId)
    val code = KeyRequests.notificationId(requestId) xor what.hashCode()
    val pi = PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val b = Notification.Action.Builder(Icon.createWithResource(context, R.drawable.sparrow_notification), context.getString(label), pi)
    // Android 12+ asks for the unlock before the button does anything.
    if (Build.VERSION.SDK_INT >= 31) b.setAuthenticationRequired(true)
    return b.build()
  }
}
