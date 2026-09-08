package expo.modules.seleva

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.content.ContentValues
import android.util.Size
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.security.MessageDigest
import kotlin.math.abs
import kotlin.math.min

/** Metadata pages only. Image pixels stay native; originals are never copied. */
class PhotoLibraryService(private val context: Context) {
  private val collection = MediaStore.Files.getContentUri("external")

  fun countAssets(): Int {
    val selection = buildString {
      append("media_type IN (1,3)")
      if (Build.VERSION.SDK_INT >= 30) append(" AND is_trashed = 0")
      if (Build.VERSION.SDK_INT >= 29) append(" AND is_pending = 0")
    }
    val result = context.contentResolver.query(
      collection,
      arrayOf("_id"),
      selection,
      null,
      null,
    ) ?: throw IllegalStateException("QUERY_FAILED")
    result.use { rows ->
      var count = 0
      while (rows.moveToNext()) count++
      return count
    }
  }

  /** Runs bounded, local metadata/image analysis without sending pixels over the bridge. */
  fun analyzeAssets(assets: List<Map<String, Any>>): List<Map<String, Any>> {
    return assets.mapNotNull { asset ->
      val id = asset["id"] as? String ?: return@mapNotNull null
      try {
        analyzeAsset(id, asset["mediaType"] as? String ?: "photo")
      } catch (_: Exception) {
        null
      }
    }
  }

  private fun analyzeAsset(id: String, mediaType: String): Map<String, Any> {
    val match = Regex("android:([1-9][0-9]*):([pv])").matchEntire(id)
      ?: throw IllegalArgumentException("INVALID_ID")
    val assetId = match.groupValues[1].toLong()
    val video = match.groupValues[2] == "v"
    val uri = ContentUris.withAppendedId(
      if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      assetId,
    )
    val bitmap = if (Build.VERSION.SDK_INT >= 29) {
      context.contentResolver.loadThumbnail(uri, Size(224, 224), null)
    } else if (video) {
      MediaStore.Video.Thumbnails.getThumbnail(context.contentResolver, assetId, MediaStore.Video.Thumbnails.MINI_KIND, null)
    } else {
      MediaStore.Images.Thumbnails.getThumbnail(context.contentResolver, assetId, MediaStore.Images.Thumbnails.MINI_KIND, null)
    }
    val analysis = mutableMapOf<String, Any>(
      "photoId" to id,
      "analysisVersion" to 1,
      "modelVersion" to "android-heuristic-1",
      "analyzedAt" to System.currentTimeMillis(),
    )
    if (bitmap != null) {
      val blur = blurScore(bitmap)
      analysis["blurScore"] = blur
      analysis["qualityScore"] = 1.0 - blur
      analysis["brightnessScore"] = brightnessScore(bitmap)
      analysis["perceptualHash"] = perceptualHash(bitmap)
      if (!video) {
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
          val text = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0))).text
          if (text.isNotBlank()) analysis["ocrText"] = text.take(10000)
        } finally {
          recognizer.close()
        }
      }
      bitmap.recycle()
    }
    if (!video) analysis["contentHash"] = contentHash(uri)
    analysis["isScreenshot"] = isScreenshot(uri)
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
    scaled.recycle()
    return values
  }

  private fun perceptualHash(bitmap: Bitmap): String {
    val values = grayscale(bitmap)
    val average = values.average()
    val result = StringBuilder(16)
    for (block in 0 until 16) {
      var value = 0
      for (bit in 0 until 4) {
        value = (value shl 1) or if (values[block * 4 + bit] >= average) 1 else 0
      }
      result.append("%x".format(value))
    }
    return result.toString()
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

  fun listAssets(limit: Int, cursor: String?, category: String = "all", beforeDate: Double? = null): Map<String, Any> {
    require(limit in 1..200)
    require(category in listOf("all", "photos", "videos", "screenshots", "favorites"))
    require(beforeDate == null || (beforeDate.isFinite() && beforeDate >= 1 && beforeDate <= 8640000000000000.0 && beforeDate % 1.0 == 0.0))
    val key = "$category:${beforeDate?.toLong() ?: 0}:"
    require(cursor == null || cursor.startsWith(key))
    val before = cursor?.removePrefix(key)?.toLongOrNull()
    require(cursor == null || (before != null && before > 0))
    val columns = mutableListOf("_id", "media_type", "datetaken", "date_added", "date_modified", "width", "height", "duration", "_size")
    if (Build.VERSION.SDK_INT >= 30) columns.add("is_favorite")
    val clauses = mutableListOf("media_type IN (1,3)")
    val parameters = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= 30) clauses.add("is_trashed = 0")
    if (Build.VERSION.SDK_INT >= 29) clauses.add("is_pending = 0")
    if (before != null) { clauses.add("_id < ?"); parameters.add(before.toString()) }
    when (category) {
      "photos" -> clauses.add("media_type = 1")
      "videos" -> clauses.add("media_type = 3")
      "favorites" -> {
        // Favorites are unavailable before Android 11, never approximate them.
        if (Build.VERSION.SDK_INT < 30) throw UnsupportedOperationException()
        clauses.add("is_favorite = 1")
      }
      "screenshots" -> {
        val path = if (Build.VERSION.SDK_INT >= 29) "relative_path" else "_data"
        clauses.add("media_type = 1 AND (LOWER($path) LIKE ? OR LOWER(_display_name) LIKE ? OR LOWER(_display_name) LIKE ?)")
        parameters.addAll(listOf("%screenshots/%", "screenshot%", "screen_shot%"))
      }
    }
    if (beforeDate != null) {
      clauses.add("(CASE WHEN datetaken > 0 THEN datetaken ELSE date_added * 1000 END) < ?")
      parameters.add(beforeDate.toLong().toString())
    }
    val selection = clauses.joinToString(" AND ")
    val args = parameters.toTypedArray()
    val resolver = context.contentResolver
    val result = if (Build.VERSION.SDK_INT >= 26) {
      val query = Bundle().apply {
        putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
        putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args)
        putString(ContentResolver.QUERY_ARG_SQL_SORT_ORDER, "_id DESC")
        putInt(ContentResolver.QUERY_ARG_LIMIT, limit + 1)
      }
      resolver.query(collection, columns.toTypedArray(), query, null)
    } else resolver.query(collection, columns.toTypedArray(), selection, args, "_id DESC LIMIT ${limit + 1}")
    val assets = mutableListOf<Map<String, Any>>()
    var next: String? = null
    (result ?: throw IllegalStateException("QUERY_FAILED")).use { rows ->
      var lastId = 0L
      while (rows.moveToNext()) {
        if (assets.size == limit) { next = key + lastId.toString(); break }
        fun number(name: String): Long = rows.getColumnIndex(name).let { if (it < 0 || rows.isNull(it)) 0L else rows.getLong(it) }
        lastId = number("_id")
        val video = number("media_type") == 3L
        val asset = mutableMapOf<String, Any>(
          "id" to "android:$lastId:${if (video) "v" else "p"}",
          "mediaType" to if (video) "video" else "photo",
          "createdAt" to (if (number("datetaken") > 0) number("datetaken").toDouble() else number("date_added") * 1000.0),
          "modifiedAt" to number("date_modified") * 1000.0,
          "width" to number("width"), "height" to number("height"),
          "fileSize" to number("_size")
        )
        if (video) asset["duration"] = number("duration") / 1000.0
        if (Build.VERSION.SDK_INT >= 30) asset["isFavorite"] = number("is_favorite") == 1L
        assets.add(asset)
      }
    }
    return mutableMapOf<String, Any>("assets" to assets).apply { next?.let { put("nextCursor", it) } }
  }

  @Synchronized fun thumbnail(id: String, size: Int): String {
    require(size in 32..512)
    val match = Regex("android:([1-9][0-9]*):([pv])").matchEntire(id) ?: throw IllegalArgumentException("INVALID_ID")
    val assetId = match.groupValues[1].toLong()
    val video = match.groupValues[2] == "v"
    val uri = ContentUris.withAppendedId(if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI, assetId)
    // Always ask MediaStore first: cached files must not bypass revoked permissions.
    val bitmap = if (Build.VERSION.SDK_INT >= 29) context.contentResolver.loadThumbnail(uri, Size(size, size), null)
      else if (video) MediaStore.Video.Thumbnails.getThumbnail(context.contentResolver, assetId, MediaStore.Video.Thumbnails.MINI_KIND, null)
      else MediaStore.Images.Thumbnails.getThumbnail(context.contentResolver, assetId, MediaStore.Images.Thumbnails.MINI_KIND, null)
    if (bitmap == null) throw java.io.FileNotFoundException()
    try {
      val directory = File(context.cacheDir, "seleva-thumbnails").apply { mkdirs() }
      val files = directory.listFiles()?.sortedBy { it.lastModified() } ?: emptyList()
      var bytes = files.sumOf { it.length() }
      var count = files.size
      for (file in files) { if (bytes < 23L * 1024 * 1024 && count < 200) break; val length = file.length(); if (file.delete()) { bytes -= length; count-- } }
      val file = File(directory, "$assetId-${if (video) "v" else "p"}-$size.jpg")
      file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.JPEG, 80, it)) }
      return android.net.Uri.fromFile(file).toString()
    } finally { bitmap.recycle() }
  }

  fun trashAssets(ids: List<String>): Map<String, Any> {
    if (Build.VERSION.SDK_INT < 30) throw UnsupportedOperationException()
    val trashed = mutableListOf<String>()
    for (id in ids.distinct()) {
      val match = Regex("android:([1-9][0-9]*):([pv])").matchEntire(id)
        ?: throw IllegalArgumentException("INVALID_ID")
      val assetId = match.groupValues[1].toLong()
      val video = match.groupValues[2] == "v"
      val uri = ContentUris.withAppendedId(
        if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        assetId,
      )
      val values = ContentValues().apply { put(MediaStore.MediaColumns.IS_TRASHED, 1) }
      if (context.contentResolver.update(uri, values, null, null) > 0) trashed.add(id)
    }
    return mapOf("trashedIds" to trashed, "cancelled" to false)
  }
}
