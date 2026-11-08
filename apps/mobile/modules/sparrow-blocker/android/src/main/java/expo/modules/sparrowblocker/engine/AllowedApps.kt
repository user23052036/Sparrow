package expo.modules.sparrowblocker.engine

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager

/**
 * The phone's own default dialer, SMS app, home screen and keyboard are never blocked either,
 * whatever their package name is on this brand of phone.
 */
object AllowedApps {
  fun defaults(context: Context): Set<String> {
    val out = mutableSetOf(context.packageName)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        (context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage?.let { out += it }
      }
    } catch (ignored: Exception) {}
    try {
      Telephony.Sms.getDefaultSmsPackage(context)?.let { out += it }
    } catch (ignored: Exception) {}
    try {
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      context.packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName?.let { out += it }
    } catch (ignored: Exception) {}
    try {
      Settings.Secure.getString(context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
        ?.substringBefore('/')
        ?.takeIf { it.isNotBlank() }
        ?.let { out += it }
    } catch (ignored: Exception) {}
    return out
  }
}
