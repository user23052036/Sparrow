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
      val state = BlockRules.fromSync(
        serverNowMs = BlockRules.parseIsoMillis(json.optString("server_now")) ?: localNow,
        localNowMs = localNow,
        active = json.optBoolean("active", false),
        endsAtServerMs = BlockRules.parseIsoMillis(json.optString("ends_at", "")),
        packages = list,
        task = if (json.isNull("task")) null else json.optString("task"),
        sessionId = if (json.isNull("session_id")) null else json.optString("session_id"),
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
