package expo.modules.seleva

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.content.ContentValues

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
