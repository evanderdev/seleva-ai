package expo.modules.seleva

/** 64-bit average hash of an 8x8 thumbnail covering the entire image. */
internal object VisualHash {
  fun fromGrayscale(pixels: IntArray): String {
    require(pixels.size == 64)
    val average = pixels.average()
    return buildString(16) {
      for (block in 0 until 16) {
        var value = 0
        for (bit in 0 until 4) {
          value = (value shl 1) or if (pixels[block * 4 + bit] >= average) 1 else 0
        }
        append(value.toString(16))
      }
    }
  }
}
