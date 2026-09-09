package expo.modules.seleva

import android.os.Process
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancel
import java.util.concurrent.Executors

/** Serial resource ownership. UI queries never queue behind analysis or OCR. */
internal class PhotoWorker(name: String, background: Boolean = false) : AutoCloseable {
  private val executor = Executors.newSingleThreadExecutor { task ->
    Thread({
      if (background) Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
      task.run()
    }, name)
  }
  private val dispatcher = executor.asCoroutineDispatcher()
  val scope = CoroutineScope(SupervisorJob() + dispatcher)

  override fun close() {
    scope.cancel()
    // Do not interrupt ML Kit while it owns a bitmap. The runner stops between
    // assets, releases its ACK wait and suppresses events after destruction.
    dispatcher.close()
  }
}
