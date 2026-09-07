import ExpoModulesCore
import Photos

public class SelevaPhotoEngineModule: Module {
  private lazy var library = PhotoLibraryService()
  private let libraryQueue = DispatchQueue(label: "seleva.library", qos: .userInitiated)
  private func libraryOperation(_ promise: Promise, operation: () throws -> Any) {
    let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    guard status == .authorized || status == .limited else { promise.reject("PERMISSION_DENIED", "Photo access required"); return }
    do { promise.resolve(try operation()) }
    catch LibraryReadError.invalidCursor { promise.reject("INVALID_CURSOR", "Refresh the library") }
    catch LibraryReadError.missingAsset { promise.reject("ASSET_NOT_FOUND", "Asset unavailable locally") }
    catch { promise.reject("UNKNOWN", "Library operation failed") }
  }
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
    OnDestroy { self.library.close() }
    AsyncFunction("listAssets") { (limit: Int, cursor: String?, promise: Promise) in
      self.libraryOperation(promise) { try self.library.listAssets(limit: limit, cursor: cursor) }
    }.runOnQueue(libraryQueue)
    AsyncFunction("getThumbnail") { (id: String, size: Int, promise: Promise) in
      self.libraryOperation(promise) { try self.library.thumbnail(id: id, size: size) }
    }.runOnQueue(libraryQueue)

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
