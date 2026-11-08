package expo.modules.sparrowblocker

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * M5b-1: only lists launchable apps so the user can build a blocklist.
 * The AccessibilityService blocking engine arrives in M5b-2.
 */
class SparrowBlockerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SparrowBlocker")

    Function("getInstalledApps") {
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, String>>()
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
        .filter { it.first != context.packageName }
        .distinctBy { it.first }
        .map { mapOf("packageName" to it.first, "label" to it.second) }
    }
  }
}
