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

class SelevaPhotoEngineModule : Module() {
  private val trashRequestCode = 7314
  private var pendingTrash: Pair<List<String>, Promise>? = null
  private val scanWorker = PhotoWorker("seleva-scan", background = true)
  private val thumbnailWorker = PhotoWorker("seleva-thumbnails")
  private val libraryWorker = PhotoWorker("seleva-library")
  private val scanner = PhotoScanRunner(::permission) { name, body -> sendEvent(name, body) }
  private var libraryService: PhotoLibraryService? = null
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
    OnDestroy {
      pendingTrash?.second?.reject("UNKNOWN", "Module closed during trash confirmation", null)
      pendingTrash = null
      scanner.close()
      scanWorker.close()
      thumbnailWorker.close()
      libraryWorker.close()
    }
    Events("scanBatch", "scanProgress", "scanCompleted", "scanFailed", "scanPaused", "scanCancelled")
    OnActivityResult { _, result ->
      if (result.requestCode == trashRequestCode) {
        val pending = pendingTrash
        pendingTrash = null
        val confirmed = result.resultCode == android.app.Activity.RESULT_OK
        pending?.second?.resolve(mapOf(
          "trashedIds" to if (confirmed) pending.first else emptyList<String>(),
          "cancelled" to !confirmed,
        ))
      }
    }
    AsyncFunction("queryAssets") { limit: Int, cursor: String?, category: String, before: Double?, promise: Promise ->
      libraryOperation(promise) { it.listAssets(limit, cursor, category, before) }
    }.runOnQueue(libraryWorker.scope)
    AsyncFunction("listAssets") { limit: Int, cursor: String?, promise: Promise ->
      libraryOperation(promise) { it.listAssets(limit, cursor) }
    }.runOnQueue(libraryWorker.scope)
    AsyncFunction("getThumbnail") { id: String, size: Int, promise: Promise ->
      libraryOperation(promise) { PhotoThumbnailStore(requireNotNull(appContext.reactContext)).thumbnail(id, size) }
    }.runOnQueue(thumbnailWorker.scope)
    AsyncFunction("trashAssets") { ids: List<String>, promise: Promise ->
      val context = appContext.reactContext
      val activity = appContext.currentActivity
      if (context == null || activity == null || Build.VERSION.SDK_INT < 30) {
        promise.reject("DEVICE_UNSUPPORTED", "System trash requires Android 11 and foreground activity", null)
        return@AsyncFunction
      }
      if (pendingTrash != null) {
        promise.reject("UNKNOWN", "Trash confirmation already active", null)
        return@AsyncFunction
      }
      if (permission(context) !in listOf("authorized", "limited")) {
        promise.reject("PERMISSION_DENIED", "Photo access required", null)
        return@AsyncFunction
      }
      try {
        val request = service(context).createTrashRequest(ids)
        pendingTrash = ids.distinct() to promise
        activity.startIntentSenderForResult(request.intentSender, trashRequestCode, null, 0, 0, 0)
      } catch (_: SecurityException) {
        pendingTrash = null
        promise.reject("PERMISSION_DENIED", "Photo access required", null)
      } catch (_: Exception) {
        pendingTrash = null
        promise.reject("UNKNOWN", "Unable to open system trash confirmation", null)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("startScan") { jobId: String, batchSize: Int, cursor: String?, promise: Promise -> scanner.scan(appContext.reactContext, jobId, batchSize, cursor, false, promise) }.runOnQueue(scanWorker.scope)
    AsyncFunction("startFastScan") { jobId: String, batchSize: Int, cursor: String?, promise: Promise -> scanner.scan(appContext.reactContext, jobId, batchSize, cursor, false, promise, true, true) }.runOnQueue(scanWorker.scope)
    AsyncFunction("startIncrementalScan") { jobId: String, batchSize: Int, cursor: String?, promise: Promise -> scanner.scan(appContext.reactContext, jobId, batchSize, cursor, false, promise, true) }.runOnQueue(scanWorker.scope)
    AsyncFunction("selectScanAssets") { jobId: String, ids: List<String> ->
      scanner.select(jobId, ids)
      Unit
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("startMetadataScan") { jobId: String, batchSize: Int, cursor: String?, promise: Promise -> scanner.scan(appContext.reactContext, jobId, batchSize, cursor, true, promise) }.runOnQueue(scanWorker.scope)

    AsyncFunction("acknowledgeScanBatch") { jobId: String -> scanner.acknowledge(jobId); Unit }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopScan") { jobId: String, mode: String, promise: Promise ->
      if (mode != "paused" && mode != "cancelled") {
        promise.reject("INVALID_SCAN", "Invalid stop mode", null)
        return@AsyncFunction
      }
      scanner.stop(jobId, mode)
      promise.resolve(mapOf("jobId" to jobId, "mode" to mode))
    }.runOnQueue(Queues.MAIN)

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
