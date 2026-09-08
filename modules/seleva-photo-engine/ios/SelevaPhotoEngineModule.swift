import ExpoModulesCore
import Photos

public class SelevaPhotoEngineModule: Module {
  private lazy var library = PhotoLibraryService()
  private let libraryQueue = DispatchQueue(label: "seleva.library", qos: .userInitiated)
  private let scanQueue = DispatchQueue(label: "seleva.scan", qos: .utility)
  private let scanLock = NSLock()
  private var scanAcks: [String: DispatchSemaphore] = [:]
  private var scanSelections: [String: Set<String>] = [:]
  private var scanStops: [String: String] = [:]
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

  private func scan(jobId: String, batchSize: Int, cursor: String?, metadataOnly: Bool, promise: Promise, incremental: Bool = false) {
      let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard status == .authorized || status == .limited else { promise.reject("PERMISSION_DENIED", "Photo access required"); return }
      guard !jobId.isEmpty && (1...200).contains(batchSize) else { promise.reject("INVALID_SCAN", "Invalid scan request"); return }
      self.scanLock.lock(); self.scanStops[jobId] = ""; self.scanLock.unlock()
      let ack = DispatchSemaphore(value: 0)
      self.scanLock.lock(); self.scanAcks[jobId] = ack; self.scanLock.unlock()
      defer { self.scanLock.lock(); self.scanAcks.removeValue(forKey: jobId); self.scanSelections.removeValue(forKey: jobId); self.scanLock.unlock() }
      do {
        let total = self.library.countAssets()
        var processed = 0
        var nextCursor = cursor
        while true {
          let page = try self.library.listAssets(limit: batchSize, cursor: nextCursor)
          let assets = page["assets"] as? [[String: Any]] ?? []
          let pageCursor = page["nextCursor"] as? String
          var selected = assets
          if incremental {
            self.sendEvent("scanBatch", ["jobId": jobId, "assets": assets, "analyses": [], "requiresAnalysis": true,
              "processed": processed, "total": total, "cursor": nextCursor as Any? ?? NSNull()])
            guard ack.wait(timeout: .now() + 60) == .success else { throw NSError(domain: "INDEX_WRITE_TIMEOUT", code: 1) }
            self.scanLock.lock()
            let ids = self.scanSelections.removeValue(forKey: jobId) ?? []
            let stopped = self.scanStops[jobId] != ""
            self.scanLock.unlock()
            selected = stopped ? [] : assets.filter { ids.contains($0["id"] as? String ?? "") }
          }
          let analyses: [[String: Any]] = metadataOnly ? [] : self.library.analyzeAssets(selected)
          processed += assets.count
          let cursorValue: Any = pageCursor ?? NSNull()
          self.sendEvent("scanBatch", ["jobId": jobId, "assets": assets, "analyses": analyses, "processed": processed, "total": total, "cursor": cursorValue])
          self.sendEvent("scanProgress", ["jobId": jobId, "processed": processed, "total": total, "progress": total == 0 ? 1.0 : Double(processed) / Double(total), "cursor": cursorValue])
          guard ack.wait(timeout: .now() + 60) == .success else { throw NSError(domain: "INDEX_WRITE_TIMEOUT", code: 1) }
          nextCursor = pageCursor
          self.scanLock.lock(); let requested = self.scanStops[jobId]; self.scanLock.unlock()
          if requested == "paused" {
            self.sendEvent("scanPaused", ["jobId": jobId, "processed": processed, "total": total, "cursor": cursorValue])
            self.scanLock.lock(); self.scanStops.removeValue(forKey: jobId); self.scanLock.unlock()
            promise.resolve(["jobId": jobId, "status": "paused", "cursor": cursorValue]); return
          }
          if requested == "cancelled" {
            self.sendEvent("scanCancelled", ["jobId": jobId, "processed": processed, "total": total, "cursor": cursorValue])
            self.scanLock.lock(); self.scanStops.removeValue(forKey: jobId); self.scanLock.unlock()
            promise.resolve(["jobId": jobId, "status": "cancelled", "cursor": cursorValue]); return
          }
          if pageCursor == nil || assets.isEmpty { break }
        }
        self.sendEvent("scanCompleted", ["jobId": jobId, "processed": processed, "total": total, "cursor": NSNull()])
        promise.resolve(["jobId": jobId, "status": "completed", "processed": processed, "total": total])
      } catch LibraryReadError.invalidCursor {
        self.sendEvent("scanFailed", ["jobId": jobId, "error": "INVALID_CURSOR"])
        promise.reject("INVALID_CURSOR", "Refresh the library")
      } catch {
        self.sendEvent("scanFailed", ["jobId": jobId, "error": "UNKNOWN"])
        promise.reject("UNKNOWN", "Library scan failed")
      }
      self.scanLock.lock(); self.scanStops.removeValue(forKey: jobId); self.scanLock.unlock()
  }

  public func definition() -> ModuleDefinition {
    Name("SelevaPhotoEngine")
    Events("scanBatch", "scanProgress", "scanCompleted", "scanFailed", "scanPaused", "scanCancelled")
    OnDestroy { self.library.close() }
    AsyncFunction("queryAssets") { (limit: Int, cursor: String?, category: String, before: Double?, promise: Promise) in
      self.libraryOperation(promise) { try self.library.listAssets(limit: limit, cursor: cursor, category: category, before: before) }
    }.runOnQueue(libraryQueue)
    AsyncFunction("listAssets") { (limit: Int, cursor: String?, promise: Promise) in
      self.libraryOperation(promise) { try self.library.listAssets(limit: limit, cursor: cursor) }
    }.runOnQueue(libraryQueue)
    AsyncFunction("getThumbnail") { (id: String, size: Int, promise: Promise) in
      self.libraryOperation(promise) { try self.library.thumbnail(id: id, size: size) }
    }.runOnQueue(libraryQueue)
    AsyncFunction("trashAssets") { (ids: [String], promise: Promise) in
      self.libraryOperation(promise) { try self.library.trashAssets(ids: ids) }
    }.runOnQueue(libraryQueue)

    AsyncFunction("startScan") { (jobId: String, batchSize: Int, cursor: String?, promise: Promise) in
      self.scan(jobId: jobId, batchSize: batchSize, cursor: cursor, metadataOnly: false, promise: promise)
    }.runOnQueue(scanQueue)
    AsyncFunction("startIncrementalScan") { (jobId: String, batchSize: Int, cursor: String?, promise: Promise) in
      self.scan(jobId: jobId, batchSize: batchSize, cursor: cursor, metadataOnly: false, promise: promise, incremental: true)
    }.runOnQueue(scanQueue)
    AsyncFunction("selectScanAssets") { (jobId: String, ids: [String], promise: Promise) in
      guard ids.count <= 200 && ids.allSatisfy({ !$0.isEmpty }) else { promise.reject("INVALID_SCAN", "Invalid batch"); return }
      self.scanLock.lock()
      let ack = self.scanAcks[jobId]
      if ack != nil { self.scanSelections[jobId] = Set(ids) }
      self.scanLock.unlock()
      ack?.signal()
      promise.resolve(nil)
    }
    AsyncFunction("startMetadataScan") { (jobId: String, batchSize: Int, cursor: String?, promise: Promise) in
      self.scan(jobId: jobId, batchSize: batchSize, cursor: cursor, metadataOnly: true, promise: promise)
    }.runOnQueue(scanQueue)

    AsyncFunction("acknowledgeScanBatch") { (jobId: String) in
      self.scanLock.lock(); let ack = self.scanAcks[jobId]; self.scanLock.unlock(); ack?.signal()
    }

    AsyncFunction("stopScan") { (jobId: String, mode: String, promise: Promise) in
      guard mode == "paused" || mode == "cancelled" else { promise.reject("INVALID_SCAN", "Invalid stop mode"); return }
      self.scanLock.lock(); self.scanStops[jobId] = mode; self.scanLock.unlock()
      promise.resolve(["jobId": jobId, "mode": mode])
    }

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      let memory = ProcessInfo.processInfo.physicalMemory
      let tier = memory < 4 * 1024 * 1024 * 1024 ? "low" : memory < 8 * 1024 * 1024 * 1024 ? "medium" : "high"
      return [
        "platform": "ios", "photoLibrary": true,
        "ocr": true, "faceDetection": false, "imageClassification": false,
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
