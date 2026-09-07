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
  private var libraryService: PhotoLibraryService? = null
  @Synchronized private fun libraryOperation(promise: Promise, action: (PhotoLibraryService) -> Any) {
    val context = appContext.reactContext
    if (context == null) { promise.reject("DEVICE_UNSUPPORTED", "Context unavailable", null); return }
    if (permission(context) !in listOf("authorized", "limited")) { promise.reject("PERMISSION_DENIED", "Photo access required", null); return }
    try {
      val service = libraryService ?: PhotoLibraryService(context).also { libraryService = it }
      promise.resolve(action(service))
    } catch (_: SecurityException) { promise.reject("PERMISSION_DENIED", "Photo access required", null) }
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
    Events("scanProgress", "scanCompleted", "scanFailed", "scanPaused")
    AsyncFunction("listAssets") { limit: Int, cursor: String?, promise: Promise ->
      libraryOperation(promise) { it.listAssets(limit, cursor) }
    }
    AsyncFunction("getThumbnail") { id: String, size: Int, promise: Promise ->
      libraryOperation(promise) { it.thumbnail(id, size) }
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
        "ocr" to false, "faceDetection" to false, "imageClassification" to false,
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
