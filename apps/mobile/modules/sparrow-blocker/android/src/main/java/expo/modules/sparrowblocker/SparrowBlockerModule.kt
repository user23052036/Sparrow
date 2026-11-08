package expo.modules.sparrowblocker

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.sparrowblocker.engine.EngineStore
import expo.modules.sparrowblocker.engine.SparrowAccessibilityService
import expo.modules.sparrowblocker.engine.SyncClient

/**
 * Bridge between the app's screens and the native blocking engine (M5b-1 app list, M5b-2 engine,
 * M5b-4 setup helpers). The engine itself runs in SparrowAccessibilityService, also when the app
 * is closed.
 */
class SparrowBlockerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("no context")

  override fun definition() = ModuleDefinition {
    Name("SparrowBlocker")

    Function("getInstalledApps") {
      val ctx = appContext.reactContext ?: return@Function emptyList<Map<String, String>>()
      val pm = ctx.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
        .filter { it.first != ctx.packageName }
        .distinctBy { it.first }
        .map { mapOf("packageName" to it.first, "label" to it.second) }
    }

    // ------------------------------------------------------------ credential for device_sync()
    Function("configure") { url: String, anonKey: String, deviceId: String, secret: String ->
      EngineStore(context).saveConfig(EngineStore.Config(url, anonKey, deviceId, secret))
    }

    Function("configuredDeviceId") {
      EngineStore(context).config()?.deviceId
    }

    Function("clearConfig") {
      EngineStore(context).clear()
    }

    Function("setAlsoAllowed") { packages: List<String> ->
      EngineStore(context).saveAlsoAllowed(packages)
    }

    // Runs on a background queue (blocking network call).
    AsyncFunction("syncNow") {
      val store = EngineStore(context)
      val st = try {
        SyncClient.sync(store, protection = isServiceEnabled(context), asleep = false)
      } catch (ignored: SyncClient.SignedOut) {
        null
      }
      val now = store.state()
      mapOf(
        "ok" to (st != null),
        "status" to store.status(),
        "active" to now.isActive(System.currentTimeMillis()),
        "endsAtMs" to now.endsAtMs.toDouble(),
        "packages" to now.packages.toList(),
      )
    }

    Function("getEngineState") {
      val store = EngineStore(context)
      val st = store.state()
      mapOf(
        "configured" to (store.config() != null),
        "status" to store.status(),
        "active" to st.isActive(System.currentTimeMillis()),
        "endsAtMs" to st.endsAtMs.toDouble(),
        "packages" to st.packages.toList(),
        "lastSyncMs" to store.lastSyncMs().toDouble(),
      )
    }

    // ------------------------------------------------------------ setup (M5b-4)
    Function("isProtectionEnabled") {
      isServiceEnabled(context)
    }

    Function("openAccessibilitySettings") {
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("isIgnoringBatteryOptimizations") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return@Function true
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    // Opens the system list (no special permission needed, unlike the direct request dialog).
    Function("openBatterySettings") {
      val list = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (list.resolveActivity(context.packageManager) != null) {
        context.startActivity(list)
      } else {
        openAppDetails(context)
      }
    }

    // Brands that stop background apps unless "autostart" is allowed. Returns false when none matched
    // (the app then shows the general advice and opens the app's own settings page).
    Function("openAutostartSettings") {
      for (c in AUTOSTART) {
        val i = Intent().setComponent(c).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (i.resolveActivity(context.packageManager) != null) {
          try {
            context.startActivity(i)
            return@Function true
          } catch (ignored: Exception) {}
        }
      }
      openAppDetails(context)
      false
    }

    Function("manufacturer") {
      Build.MANUFACTURER ?: ""
    }
  }

  private fun openAppDetails(ctx: Context) {
    ctx.startActivity(
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
  }

  companion object {
    private val AUTOSTART = listOf(
      ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
      ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
      ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
      ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
      ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
      ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
      ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
      ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
    )

    /** Enabled in Settings > Accessibility (the system may take a moment to connect it). */
    fun isServiceEnabled(ctx: Context): Boolean {
      if (SparrowAccessibilityService.running) return true
      val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
      val me = ComponentName(ctx, SparrowAccessibilityService::class.java)
      return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }
  }
}
