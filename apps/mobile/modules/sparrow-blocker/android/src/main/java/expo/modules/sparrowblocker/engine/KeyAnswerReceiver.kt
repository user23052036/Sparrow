package expo.modules.sparrowblocker.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The buttons on a key request (D46). Not exported: only Sparrow's own notifications can reach it.
 * Nothing is answered from a locked phone. "Let them out" asks once more; the confirmation and "Keep going"
 * send the answer with this phone's credential.
 */
class KeyAnswerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(KeyRequests.EXTRA_REQUEST)
    val step = KeyRequests.stepFor(intent.action, id)
    if (step == KeyRequests.Step.IGNORE) return
    val app = context.applicationContext
    if (KeyRequestNotifier.locked(app)) {
      KeyRequestNotifier.unlockFirst(app, id!!)
      return
    }
    if (step == KeyRequests.Step.ASK_TO_CONFIRM) {
      KeyRequestNotifier.confirm(app, id!!)
      return
    }
    val pending = goAsync()
    Thread {
      var sent = false
      try {
        when (SyncClient.decide(EngineStore(app), id!!, step == KeyRequests.Step.SEND_APPROVE)) {
          SyncClient.Answer.SENT -> {
            KeyRequestNotifier.answered(app, id)
            sent = true
          }
          SyncClient.Answer.GONE -> KeyRequestNotifier.answered(app, id)
          SyncClient.Answer.NOT_SENT -> KeyRequestNotifier.notSent(app, id)
        }
      } finally {
        pending.finish()
      }
      // After the broadcast is done: telling the asker may take a moment and never holds the button up.
      if (sent) SyncClient.announceAnswer(EngineStore(app), id)
    }.start()
  }
}
