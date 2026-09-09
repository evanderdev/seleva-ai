package expo.modules.seleva

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.launch
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotoWorkerTest {
  @Test fun blockedAnalysisDoesNotBlockLibraryOrThumbnails() {
    val scan = PhotoWorker("test-scan")
    val library = PhotoWorker("test-library")
    val thumbnails = PhotoWorker("test-thumbnails")
    val entered = CountDownLatch(1)
    val release = CountDownLatch(1)
    val queried = CountDownLatch(2)
    try {
      scan.scope.launch { entered.countDown(); release.await() }
      assertTrue(entered.await(5, TimeUnit.SECONDS))
      library.scope.launch { queried.countDown() }
      thumbnails.scope.launch { queried.countDown() }
      assertTrue(queried.await(5, TimeUnit.SECONDS))
    } finally {
      release.countDown()
      scan.close(); library.close(); thumbnails.close()
    }
  }

  @Test fun shutdownDoesNotInterruptResourceOwnerAndCancelsQueuedWork() {
    val worker = PhotoWorker("test-owner")
    val entered = CountDownLatch(1)
    val release = CountDownLatch(1)
    val finished = CountDownLatch(1)
    val interrupted = AtomicBoolean(false)
    val queuedRan = AtomicBoolean(false)
    try {
      worker.scope.launch {
        entered.countDown()
        try { release.await() }
        catch (_: InterruptedException) { interrupted.set(true) }
        finally { finished.countDown() }
      }
      assertTrue(entered.await(5, TimeUnit.SECONDS))
      val queued = worker.scope.launch { queuedRan.set(true) }
      worker.close()
      release.countDown()
      assertTrue(finished.await(5, TimeUnit.SECONDS))
      assertTrue(queued.isCancelled)
      assertFalse(queuedRan.get())
      assertFalse(interrupted.get())
    } finally {
      release.countDown()
      worker.close()
    }
  }
}
