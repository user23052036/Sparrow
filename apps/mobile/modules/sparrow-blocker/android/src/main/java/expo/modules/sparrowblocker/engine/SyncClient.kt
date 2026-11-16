package expo.modules.sparrowblocker.engine

import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Calls device_sync() with the anon key and this phone's secret. Blocking I/O: call it off the
 * main thread. Returns the new state, or null when offline (the old state then stays in force).
 */
object SyncClient {
  class SignedOut : Exception("device secret refused")

  /** How an answer from the phone's notification went. GONE: answered elsewhere or the session is over. */
  enum class Answer { SENT, GONE, NOT_SENT }

  /**
   * T3.2: answers a key request with this phone's credential (device_decide_end_request, 0032). Blocking I/O
   * with short timeouts: it runs while a notification button's broadcast waits (about ten seconds at most).
   */
  fun decide(store: EngineStore, requestId: String, approve: Boolean): Answer {
    val c = store.config() ?: return Answer.NOT_SENT
    val body = JSONObject()
      .put("p_device_id", c.deviceId)
      .put("p_secret", c.secret)
      .put("p_request_id", requestId)
      .put("p_approve", approve)
    val code = post(c, "/rest/v1/rpc/device_decide_end_request", body, connectMs = 3_000, readMs = 4_000) ?: return Answer.NOT_SENT
    if (code == 401 || code == 403) {
      store.saveStatus("signed_out")
      return Answer.NOT_SENT
    }
    if (code == 400 || code == 404) return Answer.GONE
    return if (code in 200..299) Answer.SENT else Answer.NOT_SENT
  }

  /** After an answer was sent: asks the notify function to tell the asker (D46). Best effort. */
  fun announceAnswer(store: EngineStore, requestId: String) {
    val c = store.config() ?: return
    val note = JSONObject()
      .put("kind", "key_answer")
      .put("ref", requestId)
      .put("device", JSONObject().put("id", c.deviceId).put("secret", c.secret))
    post(c, "/functions/v1/notify", note, connectMs = 5_000, readMs = 10_000)
  }

  /** One POST with the anon key; the HTTP status, or null when offline. */
  private fun post(c: EngineStore.Config, path: String, body: JSONObject, connectMs: Int, readMs: Int): Int? {
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL("${c.url}$path").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = connectMs
        readTimeout = readMs
        doOutput = true
        setRequestProperty("apikey", c.anonKey)
        setRequestProperty("Authorization", "Bearer ${c.anonKey}")
        setRequestProperty("Content-Type", "application/json")
      }
      conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      conn.responseCode
    } catch (e: Exception) {
      null
    } finally {
      conn?.disconnect()
    }
  }

  @Throws(SignedOut::class)
  fun sync(store: EngineStore, protection: Boolean, asleep: Boolean): EngineState? {
    val c = store.config() ?: return null
    val body = JSONObject()
      .put("p_device_id", c.deviceId)
      .put("p_secret", c.secret)
      .put("p_protection", protection)
      .put("p_asleep", asleep)
      .toString()
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL("${c.url}/rest/v1/rpc/device_sync").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 10_000
        readTimeout = 10_000
        doOutput = true
        setRequestProperty("apikey", c.anonKey)
        setRequestProperty("Authorization", "Bearer ${c.anonKey}")
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
      }
      val localBefore = System.currentTimeMillis()
      conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      if (code == 401 || code == 403) {
        store.saveStatus("signed_out")
        throw SignedOut()
      }
      if (code !in 200..299) return null
      val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
      val localNow = (localBefore + System.currentTimeMillis()) / 2
      val json = JSONObject(text)
      val pkgs = json.optJSONArray("packages")
      val list = (0 until (pkgs?.length() ?: 0)).map { pkgs!!.optString(it) }
      val doms = json.optJSONArray("domains")
      val sites = (0 until (doms?.length() ?: 0)).map { doms!!.optString(it) }
      // T3.2 (0032): requests waiting on this phone's owner as key holder; ids only. Older servers send none.
      val reqs = json.optJSONArray("key_requests")
      store.saveWaitingRequests((0 until (reqs?.length() ?: 0)).mapNotNull { reqs!!.optJSONObject(it)?.optString("id") }.filter { KeyRequests.isRequestId(it) })
      val serverNow = BlockRules.parseIsoMillis(json.optString("server_now"))
      // T3.3: how far the server's clock is ahead of this phone's, so "Check my setup" can compare server times.
      if (serverNow != null) store.saveServerOffset(serverNow - localNow)
      val state = BlockRules.fromSync(
        serverNowMs = serverNow ?: localNow,
        localNowMs = localNow,
        active = json.optBoolean("active", false),
        endsAtServerMs = BlockRules.parseIsoMillis(json.optString("ends_at", "")),
        packages = list,
        task = if (json.isNull("task")) null else json.optString("task"),
        sessionId = if (json.isNull("session_id")) null else json.optString("session_id"),
        domains = sites,
      )
      store.saveState(state)
      store.saveStatus("ok")
      state
    } catch (e: SignedOut) {
      throw e
    } catch (e: Exception) {
      null // offline or a hiccup: keep enforcing the last known state
    } finally {
      conn?.disconnect()
    }
  }
}
