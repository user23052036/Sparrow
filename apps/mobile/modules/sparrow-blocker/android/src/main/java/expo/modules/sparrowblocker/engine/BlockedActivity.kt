package expo.modules.sparrowblocker.engine

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.sparrowblocker.R

/**
 * The calm "this can wait" screen shown over a blocked app. Built in code (no layout files) and
 * worded like packages/shared/src/copy.ts (blockedTitle, blockedBody; a shared test checks the
 * strings). Back goes to the home screen, never back into the blocked app.
 */
class BlockedActivity : Activity() {
  private val main = Handler(Looper.getMainLooper())
  private var endsAt = 0L
  private lateinit var left: TextView

  private val countdown = object : Runnable {
    override fun run() {
      val ms = endsAt - System.currentTimeMillis()
      if (ms <= 0) {
        finish()
        return
      }
      val m = ms / 60_000
      val s = (ms / 1000) % 60
      left.text = getString(R.string.sparrow_blocked_left, m, s)
      main.postDelayed(this, 1000)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    endsAt = intent.getLongExtra(EXTRA_ENDS, 0L)
    val task = intent.getStringExtra(EXTRA_TASK)
    val ink = Color.parseColor("#2B2A28")
    val soft = Color.parseColor("#5E5A54")
    val pad = (24 * resources.displayMetrics.density).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(pad, pad, pad, pad)
      setBackgroundColor(Color.parseColor("#FBF8F3"))
    }
    fun text(s: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
      text = s
      textSize = size
      setTextColor(color)
      gravity = Gravity.CENTER
      if (bold) typeface = Typeface.DEFAULT_BOLD
      setPadding(0, pad / 3, 0, pad / 3)
    }
    root.addView(text(getString(R.string.sparrow_blocked_title), 28f, ink, bold = true))
    root.addView(text(getString(R.string.sparrow_blocked_body), 17f, soft))
    if (!task.isNullOrBlank()) root.addView(text(getString(R.string.sparrow_blocked_task, task), 17f, ink))
    left = text("", 15f, soft)
    root.addView(left)

    val step = Button(this).apply {
      text = getString(R.string.sparrow_blocked_step)
      setOnClickListener { openSparrow() }
    }
    val home = Button(this).apply {
      text = getString(R.string.sparrow_blocked_home)
      setOnClickListener { goHome() }
    }
    val lp = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = pad / 2 }
    root.addView(step, lp)
    root.addView(home, LinearLayout.LayoutParams(lp))
    setContentView(root)
  }

  override fun onResume() {
    super.onResume()
    main.post(countdown)
  }

  override fun onPause() {
    main.removeCallbacks(countdown)
    super.onPause()
  }

  @Deprecated("Back goes home, not back into the blocked app")
  override fun onBackPressed() {
    goHome()
  }

  private fun openSparrow() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      startActivity(it)
    }
    finish()
  }

  private fun goHome() {
    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    finish()
  }

  companion object {
    private const val EXTRA_PKG = "pkg"
    private const val EXTRA_TASK = "task"
    private const val EXTRA_ENDS = "ends"

    fun intent(context: Context, pkg: String, task: String?, endsAtMs: Long): Intent =
      Intent(context, BlockedActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_ANIMATION)
        .putExtra(EXTRA_PKG, pkg)
        .putExtra(EXTRA_TASK, task)
        .putExtra(EXTRA_ENDS, endsAtMs)
  }
}
