// NOT part of the app. Minimal stand-ins for the few expo-modules-core names SparrowBlockerModule.kt
// uses, so check-android-api.sh can type-check the module without Gradle or Maven. The real
// classes come from expo-modules-core in a normal build. Keep in step with what the module calls.
@file:Suppress("FunctionName", "UNUSED_PARAMETER", "unused")

package expo.modules.kotlin

import android.app.Activity
import android.content.Context

class AppContext {
  val reactContext: Context? = null
  val currentActivity: Activity? = null
}
