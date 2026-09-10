package expo.modules.seleva

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.security.MessageDigest
import kotlin.math.abs
import kotlin.math.min

/** Bounded thumbnail workers; deep OCR has exclusive single-worker ownership. */
internal class PhotoAnalyzer(private val context: Context) {
  /** Runs bounded, local metadata/image analysis without sending pixels over the bridge. */
  fun analyzeAssets(assets: List<Map<String, Any>>, fastOnly: Boolean = false, stopped: () -> Boolean): List<Map<String, Any>> {
    val profile = ScanProfile(context, if (fastOnly) "fast" else "deep")
    val concurrency = if (fastOnly) ScanTuning.fastConcurrency else ScanTuning.deepConcurrency
    val executor = java.util.concurrent.Executors.newFixedThreadPool(concurrency)
    val recognizer = if (fastOnly) null else TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      // Submit only one bounded window at a time; never queue the whole library.
      return assets.chunked(concurrency).flatMap { window ->
        val futures = window.map { asset -> executor.submit<Map<String, Any>?> {
          android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND)
          if (stopped()) return@submit null
          val id = asset["id"] as? String ?: return@submit null
          try {
            profile.measure("asset") { analyzeAsset(id, recognizer, fastOnly, profile) }
          } catch (error: SecurityException) { throw error }
            catch (_: Exception) { profile.count("failed"); null }
        } }
        // Drain every in-flight task before propagating permission errors or returning.
        var failure: Throwable? = null
        val results = futures.mapNotNull { future ->
          try { future.get() } catch (error: java.util.concurrent.ExecutionException) {
            failure = error.cause; null
          }
        }
        failure?.let { throw it }
        results
      }
    } finally { executor.shutdown(); recognizer?.close(); profile.finish() }
  }

  private fun analyzeAsset(id: String, recognizer: com.google.mlkit.vision.text.TextRecognizer?, fastOnly: Boolean, profile: ScanProfile): Map<String, Any> {
    val match = Regex("android:([1-9][0-9]*):([pv])").matchEntire(id)
      ?: throw IllegalArgumentException("INVALID_ID")
    val assetId = match.groupValues[1].toLong()
    val video = match.groupValues[2] == "v"
    val uri = ContentUris.withAppendedId(
      if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      assetId,
    )
    val bitmap = try {
      profile.measure("thumbnail") { if (Build.VERSION.SDK_INT >= 29) {
        context.contentResolver.loadThumbnail(uri, Size(224, 224), null)
      } else if (video) {
        MediaStore.Video.Thumbnails.getThumbnail(context.contentResolver, assetId, MediaStore.Video.Thumbnails.MINI_KIND, null)
      } else {
        MediaStore.Images.Thumbnails.getThumbnail(context.contentResolver, assetId, MediaStore.Images.Thumbnails.MINI_KIND, null)
      }
      }
    } catch (error: SecurityException) { throw error
    } catch (_: Exception) { profile.count("failed"); null }
    val completed = linkedSetOf<String>()
    val failures = mutableListOf<Map<String, Any>>()
    val expected = if (fastOnly) listOf(
      "content.screenshot", "quality.visual", "similarity.perceptual"
    ) else listOf(
      "content.screenshot", "quality.visual", "similarity.perceptual", "duplicate.exact", "text.ocr"
    )
    fun failed(capabilityId: String, error: String) {
      if (capabilityId !in completed && failures.none { it["capabilityId"] == capabilityId })
        failures += mapOf("capabilityId" to capabilityId, "status" to "failed", "error" to error)
    }
    fun completed(capabilityId: String) {
      if (failures.none { it["capabilityId"] == capabilityId }) completed += capabilityId
    }
    val analysis = mutableMapOf<String, Any>(
      "photoId" to id,
      "analysisVersion" to 1,
      "modelVersion" to if (fastOnly) "android-fast-2" else "android-heuristic-2",
      "analyzedAt" to System.currentTimeMillis(),
    )
    if (bitmap == null) {
      profile.count("unavailable")
      failed("quality.visual", "THUMBNAIL_UNAVAILABLE")
      failed("similarity.perceptual", "THUMBNAIL_UNAVAILABLE")
    } else {
      try {
        val blur = profile.measure("blur") { blurScore(bitmap) }
        analysis["blurScore"] = blur
        analysis["qualityScore"] = 1.0 - blur
        analysis["brightnessScore"] = profile.measure("brightness") { brightnessScore(bitmap) }
        completed("quality.visual")
      } catch (error: SecurityException) { throw error
      } catch (_: Exception) { profile.count("failed"); failed("quality.visual", "QUALITY_FAILED") }
      try {
        analysis["perceptualHash"] = profile.measure("visualHash") { perceptualHash(bitmap) }
        completed("similarity.perceptual")
      } catch (error: SecurityException) { throw error
      } catch (_: Exception) { profile.count("failed"); failed("similarity.perceptual", "VISUAL_HASH_FAILED") }
      if (!video && !fastOnly && recognizer != null) {
        try {
          val text = profile.measure("ocr") { Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0))).text }
          if (text.isNotBlank()) analysis["ocrText"] = text.take(10000)
          completed("text.ocr")
        } catch (error: SecurityException) { throw error
        } catch (_: Exception) { profile.count("failed"); failed("text.ocr", "OCR_FAILED") }
      } else if (!fastOnly) {
        // OCR is not applicable to videos; record that the capability was handled.
        completed("text.ocr")
      }
      try { bitmap.recycle() } catch (_: Exception) { /* release is best effort */ }
    }
    try {
      analysis["isScreenshot"] = isScreenshot(uri)
      completed("content.screenshot")
    } catch (error: SecurityException) { throw error
    } catch (_: Exception) { profile.count("failed"); failed("content.screenshot", "SCREENSHOT_FAILED") }
    if (!fastOnly) {
      if (!video) {
        try {
          analysis["contentHash"] = profile.measure("contentHash") { contentHash(uri) }
          completed("duplicate.exact")
        } catch (error: SecurityException) { throw error
        } catch (_: Exception) { profile.count("failed"); failed("duplicate.exact", "CONTENT_HASH_FAILED") }
      } else {
        completed("duplicate.exact")
      }
    }
    expected.filter { capabilityId -> capabilityId !in completed && failures.none { it["capabilityId"] == capabilityId } }
      .forEach { capabilityId -> failed(capabilityId, "NOT_PROCESSED") }
    analysis["capabilityResults"] = completed.map { mapOf("capabilityId" to it, "status" to "completed") } + failures
    return analysis
  }

  private fun isScreenshot(uri: android.net.Uri): Boolean {
    val pathColumn = if (Build.VERSION.SDK_INT >= 29) MediaStore.MediaColumns.RELATIVE_PATH else MediaStore.MediaColumns.DATA
    val columns = arrayOf(MediaStore.MediaColumns.DISPLAY_NAME, pathColumn)
    val result = context.contentResolver.query(uri, columns, null, null, null) ?: return false
    result.use { rows ->
      if (!rows.moveToFirst()) return false
      val name = rows.getString(0)?.lowercase() ?: ""
      val path = if (rows.columnCount > 1) rows.getString(1)?.lowercase() ?: "" else ""
      return path.contains("screenshot") || name.startsWith("screenshot") || name.startsWith("screen_shot")
    }
  }

  private fun contentHash(uri: android.net.Uri): String {
    val digest = MessageDigest.getInstance("SHA-256")
    val input = context.contentResolver.openInputStream(uri) ?: throw java.io.FileNotFoundException()
    input.use { stream ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val count = stream.read(buffer)
        if (count <= 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
  }

  private fun grayscale(bitmap: Bitmap, size: Int = 32): IntArray {
    val scaled = Bitmap.createScaledBitmap(bitmap, size, size, true)
    val values = IntArray(size * size)
    for (y in 0 until size) for (x in 0 until size) {
      val color = scaled.getPixel(x, y)
      values[y * size + x] = (0.299 * ((color shr 16) and 0xff) +
        0.587 * ((color shr 8) and 0xff) + 0.114 * (color and 0xff)).toInt()
    }
    if (scaled !== bitmap) scaled.recycle()
    return values
  }

  private fun perceptualHash(bitmap: Bitmap): String {
    return VisualHash.fromGrayscale(grayscale(bitmap, 8))
  }

  private fun blurScore(bitmap: Bitmap): Double {
    val values = grayscale(bitmap)
    var edge = 0.0
    var count = 0
    for (y in 1 until 31) for (x in 1 until 31) {
      val center = values[y * 32 + x]
      edge += abs(4 * center - values[y * 32 + x - 1] - values[y * 32 + x + 1] - values[(y - 1) * 32 + x] - values[(y + 1) * 32 + x])
      count++
    }
    return 1.0 - min(1.0, edge / count / 80.0)
  }

  private fun brightnessScore(bitmap: Bitmap): Double {
    val values = grayscale(bitmap)
    val average = values.average() / 255.0
    return 1.0 - min(1.0, abs(average - 0.5) * 2.0)
  }

}
