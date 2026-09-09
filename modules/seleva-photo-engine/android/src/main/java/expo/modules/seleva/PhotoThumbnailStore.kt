package expo.modules.seleva

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import java.io.File

/** Confined to the thumbnail worker; never takes the scanner's lock. */
internal class PhotoThumbnailStore(private val context: Context) {
  fun thumbnail(id: String, size: Int): String {
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
