package expo.modules.seleva

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.SystemClock
import android.util.Log

internal object ScanTuning {
  const val fastConcurrency = 3
  const val deepConcurrency = 1
}

/** Aggregate durations only: no identifiers, paths, OCR or image content. */
internal class ScanProfile(context: Context, private val stage: String) {
  private val enabled = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  private val started = SystemClock.elapsedRealtime()
  private val times = mutableMapOf<String, Long>()
  private val counts = mutableMapOf<String, Int>()
  @Synchronized fun count(name: String) { if (enabled) counts[name] = (counts[name] ?: 0) + 1 }
  fun <T> measure(name: String, action: () -> T): T {
    val start = SystemClock.elapsedRealtime()
    try { return action() } finally {
      synchronized(this) {
        if (enabled) { times[name] = (times[name] ?: 0) + SystemClock.elapsedRealtime() - start; count(name) }
      }
    }
  }
  fun finish() {
    if (enabled) Log.d("SelevaScan", "$stage wallMs=${SystemClock.elapsedRealtime() - started} durationsMs=$times counts=$counts")
  }
}
