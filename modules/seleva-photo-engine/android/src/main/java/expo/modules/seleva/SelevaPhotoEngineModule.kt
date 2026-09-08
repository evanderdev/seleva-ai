package expo.modules.seleva

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

class SelevaPhotoEngineModule : Module() {
  private var libraryService: PhotoLibraryService? = null
  private val scanStops = ConcurrentHashMap<String, AtomicReference<String?>>()
  @Synchronized private fun service(context: Context): PhotoLibraryService =
    libraryService ?: PhotoLibraryService(context).also { libraryService = it }

  private fun libraryOperation(promise: Promise, action: (PhotoLibraryService) -> Any) {
    val context = appContext.reactContext
    if (context == null) { promise.reject("DEVICE_UNSUPPORTED", "Context unavailable", null); return }
    if (permission(context) !in listOf("authorized", "limited")) { promise.reject("PERMISSION_DENIED", "Photo access required", null); return }
    try {
      promise.resolve(action(service(context)))
    } catch (_: SecurityException) { promise.reject("PERMISSION_DENIED", "Photo access required", null) }
      catch (_: UnsupportedOperationException) { promise.reject("DEVICE_UNSUPPORTED", "Feature unavailable on this device", null) }
      catch (_: java.io.FileNotFoundException) { promise.reject("ASSET_NOT_FOUND", "Asset unavailable", null) }
      catch (_: IllegalArgumentException) { promise.reject("INVALID_CURSOR", "Invalid library request", null) }
      catch (_: Exception) { promise.reject("UNKNOWN", "Library operation failed", null) }
  }
  private fun granted(context: Context, permission: String): Boolean =
    context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private fun permission(context: Context): String {
    if (Build.VERSION.SDK_INT >= 33) {
      val images = granted(context, Manifest.permission.READ_MEDIA_IMAGES)
      val videos = granted(context, Manifest.permission.READ_MEDIA_VIDEO)
      if (images && videos) return "authorized"
      if (images || videos || (Build.VERSION.SDK_INT >= 34 &&
          granted(context, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED))) return "limited"
    } else if (granted(context, Manifest.permission.READ_EXTERNAL_STORAGE)) return "authorized"
    val requested = context.getSharedPreferences("seleva_permissions", Context.MODE_PRIVATE)
      .getBoolean("requested", false)
    return if (requested) "denied" else "not-determined"
  }

  override fun definition() = ModuleDefinition {
    Name("SelevaPhotoEngine")
    Events("scanBatch", "scanProgress", "scanCompleted", "scanFailed", "scanPaused", "scanCancelled")
    AsyncFunction("queryAssets") { limit: Int, cursor: String?, category: String, before: Double?, promise: Promise ->
      libraryOperation(promise) { it.listAssets(limit, cursor, category, before) }
    }
    AsyncFunction("listAssets") { limit: Int, cursor: String?, promise: Promise ->
      libraryOperation(promise) { it.listAssets(limit, cursor) }
    }
    AsyncFunction("getThumbnail") { id: String, size: Int, promise: Promise ->
      libraryOperation(promise) { it.thumbnail(id, size) }
    }
    AsyncFunction("trashAssets") { ids: List<String>, promise: Promise ->
      libraryOperation(promise) { it.trashAssets(ids) }
    }

    AsyncFunction("startScan") { jobId: String, batchSize: Int, cursor: String?, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("DEVICE_UNSUPPORTED", "Context unavailable", null)
        return@AsyncFunction
      }
      if (jobId.isBlank() || batchSize !in 1..200) {
        promise.reject("INVALID_SCAN", "Invalid scan request", null)
        return@AsyncFunction
      }
      if (permission(context) !in listOf("authorized", "limited")) {
        promise.reject("PERMISSION_DENIED", "Photo access required", null)
        return@AsyncFunction
      }
      val stop = AtomicReference<String?>(null)
      scanStops[jobId] = stop
      try {
        val service = service(context)
        val total = service.countAssets()
        var processed = 0
        var nextCursor = cursor
        while (true) {
          val page = service.listAssets(batchSize, nextCursor)
          @Suppress("UNCHECKED_CAST")
          val assets = page["assets"] as? List<Map<String, Any>> ?: emptyList()
          val pageCursor = page["nextCursor"] as? String
          val analyses = service.analyzeAssets(assets)
          processed += assets.size
          sendEvent("scanBatch", mapOf(
            "jobId" to jobId,
            "assets" to assets,
            "analyses" to analyses,
            "processed" to processed,
            "total" to total,
            "cursor" to pageCursor,
          ))
          sendEvent("scanProgress", mapOf(
            "jobId" to jobId,
            "processed" to processed,
            "total" to total,
            "progress" to if (total == 0) 1.0 else processed.toDouble() / total.toDouble(),
            "cursor" to pageCursor,
          ))
          nextCursor = pageCursor
          val requested = stop.get()
          if (requested == "paused") {
            sendEvent("scanPaused", mapOf("jobId" to jobId, "processed" to processed, "total" to total, "cursor" to nextCursor))
            promise.resolve(mapOf("jobId" to jobId, "status" to "paused", "cursor" to nextCursor))
            return@AsyncFunction
          }
          if (requested == "cancelled") {
            sendEvent("scanCancelled", mapOf("jobId" to jobId, "processed" to processed, "total" to total, "cursor" to nextCursor))
            promise.resolve(mapOf("jobId" to jobId, "status" to "cancelled", "cursor" to nextCursor))
            return@AsyncFunction
          }
          if (pageCursor == null || assets.isEmpty()) break
        }
        sendEvent("scanCompleted", mapOf("jobId" to jobId, "processed" to processed, "total" to total, "cursor" to null))
        promise.resolve(mapOf("jobId" to jobId, "status" to "completed", "processed" to processed, "total" to total))
      } catch (_: SecurityException) {
        sendEvent("scanFailed", mapOf("jobId" to jobId, "error" to "PERMISSION_DENIED"))
        promise.reject("PERMISSION_DENIED", "Photo access required", null)
      } catch (_: Exception) {
        sendEvent("scanFailed", mapOf("jobId" to jobId, "error" to "UNKNOWN"))
        promise.reject("UNKNOWN", "Library scan failed", null)
      } finally {
        scanStops.remove(jobId)
      }
    }

    AsyncFunction("stopScan") { jobId: String, mode: String, promise: Promise ->
      if (mode != "paused" && mode != "cancelled") {
        promise.reject("INVALID_SCAN", "Invalid stop mode", null)
        return@AsyncFunction
      }
      scanStops[jobId]?.set(mode)
      promise.resolve(mapOf("jobId" to jobId, "mode" to mode))
    }

    AsyncFunction("getCapabilities") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.reject("DEVICE_UNSUPPORTED", "Context unavailable", null); return@AsyncFunction }
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memory = ActivityManager.MemoryInfo()
      manager.getMemoryInfo(memory)
      val tier = if (manager.isLowRamDevice || memory.totalMem < 4L * 1024 * 1024 * 1024) "low"
        else if (memory.totalMem < 8L * 1024 * 1024 * 1024) "medium" else "high"
      promise.resolve(mapOf(
        "platform" to "android", "photoLibrary" to true,
        "ocr" to true, "faceDetection" to false, "imageClassification" to false,
        "embeddings" to false, "nativeLLM" to false, "backgroundIndexing" to false,
        "performanceTier" to tier
      ))
    }

    AsyncFunction("getPermission") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) promise.reject("DEVICE_UNSUPPORTED", "Context unavailable", null)
      else promise.resolve(permission(context))
    }

    AsyncFunction("requestPermission") { promise: Promise ->
      val context = appContext.reactContext
      val permissions = appContext.permissions
      if (context == null || permissions == null || appContext.currentActivity == null) {
        promise.reject("DEVICE_UNSUPPORTED", "Foreground activity required", null)
        return@AsyncFunction
      }
      val names = if (Build.VERSION.SDK_INT >= 34) arrayOf(
        Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO,
        Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
      ) else if (Build.VERSION.SDK_INT >= 33) arrayOf(
        Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO
      ) else arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
      context.getSharedPreferences("seleva_permissions", Context.MODE_PRIVATE)
        .edit().putBoolean("requested", true).apply()
      permissions.askForPermissions({ promise.resolve(permission(context)) }, *names)
    }.runOnQueue(Queues.MAIN)
  }
}
