import ExpoModulesCore
import Photos

public class SelevaPhotoEngineModule: Module {
  private func permission(_ status: PHAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .limited: return "limited"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "not-determined"
    @unknown default: return "restricted"
    }
  }

  public func definition() -> ModuleDefinition {
    Name("SelevaPhotoEngine")
    Events("scanProgress", "scanCompleted", "scanFailed", "scanPaused")

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      let memory = ProcessInfo.processInfo.physicalMemory
      let tier = memory < 4 * 1024 * 1024 * 1024 ? "low" : memory < 8 * 1024 * 1024 * 1024 ? "medium" : "high"
      return [
        "platform": "ios", "photoLibrary": true,
        "ocr": false, "faceDetection": false, "imageClassification": false,
        "embeddings": false, "nativeLLM": false, "backgroundIndexing": false,
        "performanceTier": tier
      ]
    }

    AsyncFunction("getPermission") { () -> String in
      self.permission(PHPhotoLibrary.authorizationStatus(for: .readWrite))
    }

    AsyncFunction("requestPermission") { (promise: Promise) in
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
        promise.resolve(self.permission(status))
      }
    }.runOnQueue(.main)
  }
}
