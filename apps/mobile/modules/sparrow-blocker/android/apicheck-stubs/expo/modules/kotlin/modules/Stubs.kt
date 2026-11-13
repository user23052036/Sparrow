// NOT part of the app: see ../Stubs.kt (android/apicheck-stubs).
@file:Suppress("FunctionName", "UNUSED_PARAMETER", "unused")

package expo.modules.kotlin.modules

import expo.modules.kotlin.AppContext

class ModuleDefinitionData

class ModuleDefinitionBuilder {
  fun Name(name: String) {}

  @JvmName("FunctionWithoutArgs")
  fun Function(name: String, body: () -> Any?) {}

  fun <R, A> Function(name: String, body: (A) -> R) {}

  fun <R, A, B> Function(name: String, body: (A, B) -> R) {}

  fun <R, A, B, C> Function(name: String, body: (A, B, C) -> R) {}

  fun <R, A, B, C, D> Function(name: String, body: (A, B, C, D) -> R) {}

  @JvmName("AsyncFunctionWithoutArgs")
  fun AsyncFunction(name: String, body: () -> Any?) {}

  fun <R, A> AsyncFunction(name: String, body: (A) -> R) {}
}

abstract class Module {
  val appContext: AppContext = AppContext()

  abstract fun definition(): ModuleDefinitionData
}

fun Module.ModuleDefinition(block: ModuleDefinitionBuilder.() -> Unit): ModuleDefinitionData {
  ModuleDefinitionBuilder().block()
  return ModuleDefinitionData()
}
