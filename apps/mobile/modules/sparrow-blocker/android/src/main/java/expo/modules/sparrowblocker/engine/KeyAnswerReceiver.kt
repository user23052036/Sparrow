package expo.modules.sparrowblocker.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The buttons on a key request (D46). Not exported: only Sparrow's own notifications can reach it.
 * "Let them out" asks once more; the confirmation and "Keep going" send the answer with this phone's credential.
 */
class KeyAnswerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(KeyRequests.EXTRA_REQUEST)
    val approve = when (KeyRequests.stepFor(intent.action, id)) {
      KeyRequests.Step.IGNORE -> return
      KeyRequests.Step.ASK_TO_CONFIRM -> {
        KeyRequestNotifier.confirm(context, id!!)
        return
      }
      KeyRequests.Step.SEND_APPROVE -> true
      KeyRequests.Step.SEND_DENY -> false
    }
    val app = context.applicationContext
    val pending = goAsync()
    Thread {
      try {
        when (SyncClient.decide(EngineStore(app), id!!, approve)) {
          SyncClient.Answer.SENT, SyncClient.Answer.GONE -> KeyRequestNotifier.answered(app, id)
          SyncClient.Answer.NOT_SENT -> KeyRequestNotifier.notSent(app, id)
        }
      } finally {
        pending.finish()
      }
    }.start()
  }
}
