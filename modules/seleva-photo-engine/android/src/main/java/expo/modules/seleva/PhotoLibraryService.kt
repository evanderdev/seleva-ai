package expo.modules.seleva

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Size
import java.io.File

/** Metadata pages only. Image pixels stay native; originals are never copied. */
class PhotoLibraryService(private val context: Context) {
  private val collection = MediaStore.Files.getContentUri("external")

  fun listAssets(limit: Int, cursor: String?): Map<String, Any> {
    require(limit in 1..200)
    val before = cursor?.toLongOrNull()
    require(cursor == null || (before != null && before > 0))
    val columns = mutableListOf("_id", "media_type", "datetaken", "date_added", "date_modified", "width", "height", "duration", "_size")
    if (Build.VERSION.SDK_INT >= 30) columns.add("is_favorite")
    val selection = "media_type IN (1,3)" + (if (before != null) " AND _id < ?" else "")
    val args = if (before != null) arrayOf(before.toString()) else emptyArray<String>()
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
        if (assets.size == limit) { next = lastId.toString(); break }
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
}
