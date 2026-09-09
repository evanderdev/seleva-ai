package expo.modules.seleva

import android.content.Context
import expo.modules.kotlin.Promise
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

/** Batch protocol and checkpoints; heavy work runs only on the scan worker. */
internal class PhotoScanRunner(
  private val permission: (Context) -> String,
  private val send: (String, Map<String, Any?>) -> Unit,
) {
  @Volatile private var destroyed = false
  private val scanAcks = ConcurrentHashMap<String, java.util.concurrent.Semaphore>()
  private val scanSelections = ConcurrentHashMap<String, Set<String>>()
  private val scanStops = ConcurrentHashMap<String, AtomicReference<String?>>()

  @Synchronized private fun emit(name: String, body: Map<String, Any?>) {
    if (!destroyed) send(name, body)
  }

  @Synchronized fun close() {
    destroyed = true
    scanStops.values.forEach { it.set("cancelled") }
    scanAcks.values.forEach { it.release() }
  }

  fun select(jobId: String, ids: List<String>) {
    require(ids.size <= 200 && ids.all { it.isNotBlank() })
    if (scanAcks.containsKey(jobId)) {
      scanSelections[jobId] = ids.toSet()
      scanAcks[jobId]?.release()
    }
  }

  fun acknowledge(jobId: String) { scanAcks[jobId]?.release() }
  fun stop(jobId: String, mode: String) { scanStops[jobId]?.set(mode) }

  fun scan(context: Context?, jobId: String, batchSize: Int, cursor: String?, metadataOnly: Boolean, promise: Promise, incremental: Boolean = false) {
      if (destroyed) return
      if (context == null) {
        promise.reject("DEVICE_UNSUPPORTED", "Context unavailable", null)
        return
      }
      if (jobId.isBlank() || batchSize !in 1..200) {
        promise.reject("INVALID_SCAN", "Invalid scan request", null)
        return
      }
      if (permission(context) !in listOf("authorized", "limited")) {
        promise.reject("PERMISSION_DENIED", "Photo access required", null)
        return
      }
      val stop = AtomicReference<String?>(null)
      scanStops[jobId] = stop
      val ack = java.util.concurrent.Semaphore(0)
      scanAcks[jobId] = ack
      try {
        val service = PhotoLibraryService(context)
        val total = service.countAssets()
        var processed = 0
        var nextCursor = cursor
        while (true) {
          if (destroyed) return
          val page = service.listAssets(if (metadataOnly) batchSize else minOf(batchSize, 20), nextCursor)
          @Suppress("UNCHECKED_CAST")
          val assets = page["assets"] as? List<Map<String, Any>> ?: emptyList()
          val pageCursor = page["nextCursor"] as? String
          var selected = assets
          if (incremental) {
            emit("scanBatch", mapOf("jobId" to jobId, "assets" to assets,
              "analyses" to emptyList<Map<String, Any>>(), "requiresAnalysis" to true,
              "processed" to processed, "total" to total, "cursor" to nextCursor))
            if (!ack.tryAcquire(60, java.util.concurrent.TimeUnit.SECONDS)) throw IllegalStateException("INDEX_WRITE_TIMEOUT")
            if (destroyed) return
            val ids = scanSelections.remove(jobId) ?: emptySet()
            selected = if (stop.get() == null) assets.filter { it["id"] in ids } else emptyList()
          }
          val analyses = if (metadataOnly) emptyList<Map<String, Any>>() else PhotoAnalyzer(context).analyzeAssets(selected) { destroyed }
          if (destroyed) return
          processed += assets.size
          emit("scanBatch", mapOf(
            "jobId" to jobId,
            "assets" to assets,
            "analyses" to analyses,
            "processed" to processed,
            "total" to total,
            "cursor" to pageCursor,
          ))
          emit("scanProgress", mapOf(
            "jobId" to jobId,
            "processed" to processed,
            "total" to total,
            "progress" to if (total == 0) 1.0 else processed.toDouble() / total.toDouble(),
            "cursor" to pageCursor,
          ))
          if (!ack.tryAcquire(60, java.util.concurrent.TimeUnit.SECONDS)) throw IllegalStateException("INDEX_WRITE_TIMEOUT")
          if (destroyed) return
          nextCursor = pageCursor
          val requested = stop.get()
          if (requested == "paused") {
            emit("scanPaused", mapOf("jobId" to jobId, "processed" to processed, "total" to total, "cursor" to nextCursor))
            promise.resolve(mapOf("jobId" to jobId, "status" to "paused", "cursor" to nextCursor))
            return
          }
          if (requested == "cancelled") {
            emit("scanCancelled", mapOf("jobId" to jobId, "processed" to processed, "total" to total, "cursor" to nextCursor))
            promise.resolve(mapOf("jobId" to jobId, "status" to "cancelled", "cursor" to nextCursor))
            return
          }
          if (pageCursor == null || assets.isEmpty()) break
        }
        emit("scanCompleted", mapOf("jobId" to jobId, "processed" to processed, "total" to total, "cursor" to null))
        promise.resolve(mapOf("jobId" to jobId, "status" to "completed", "processed" to processed, "total" to total))
      } catch (_: SecurityException) {
        if (destroyed) return
        emit("scanFailed", mapOf("jobId" to jobId, "error" to "PERMISSION_DENIED"))
        promise.reject("PERMISSION_DENIED", "Photo access required", null)
      } catch (_: Exception) {
        if (destroyed) return
        emit("scanFailed", mapOf("jobId" to jobId, "error" to "UNKNOWN"))
        promise.reject("UNKNOWN", "Library scan failed", null)
      } finally {
        scanStops.remove(jobId)
        scanAcks.remove(jobId)
        scanSelections.remove(jobId)
      }
  }

}
