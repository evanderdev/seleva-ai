package expo.modules.seleva

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class VisualHashTest {
  @Test fun includesBottomHalfOfImage() {
    val bottomBright = IntArray(64) { if (it >= 32) 255 else 0 }
    val topBright = IntArray(64) { if (it < 32) 255 else 0 }
    assertEquals("00000000ffffffff", VisualHash.fromGrayscale(bottomBright))
    assertEquals("ffffffff00000000", VisualHash.fromGrayscale(topBright))
    val bottomChanged = bottomBright.copyOf().apply { this[63] = 0 }
    assertNotEquals(VisualHash.fromGrayscale(bottomBright), VisualHash.fromGrayscale(bottomChanged))
  }

  @Test fun uniformExposureShiftPreservesStructure() {
    val pixels = IntArray(64) { it * 2 }
    assertEquals(VisualHash.fromGrayscale(pixels), VisualHash.fromGrayscale(pixels.map { it + 30 }.toIntArray()))
  }
}
