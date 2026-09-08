import Photos
import UIKit
import CryptoKit
import Vision

enum LibraryReadError: Error { case invalidCursor, missingAsset }

final class PhotoLibraryService: NSObject, PHPhotoLibraryChangeObserver {
  private let lock = NSLock()
  // PHFetchResult is lazy: only the requested page is materialized into dictionaries.
  private var snapshot: PHFetchResult<PHAsset>?
  private var generation = UUID().uuidString
  private var queryKey = ""

  override init() {
    super.init()
    PHPhotoLibrary.shared().register(self)
  }
  func close() { PHPhotoLibrary.shared().unregisterChangeObserver(self) }
  func countAssets() -> Int {
    let options = PHFetchOptions()
    options.predicate = NSPredicate(format: "mediaType == %d OR mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
    return PHAsset.fetchAssets(with: options).count
  }

  // Analysis stays native: only compact scores, hashes and OCR text cross the bridge.
  func analyzeAssets(_ assets: [[String: Any]]) -> [[String: Any]] {
    assets.compactMap { row in
      guard let id = row["id"] as? String,
            id.hasPrefix("ios:"),
            let data = Data(base64Encoded: String(id.dropFirst(4))),
            let identifier = String(data: data, encoding: .utf8),
            let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject else { return nil }
      return analyzeAsset(asset, id: id)
    }
  }

  private func analyzeAsset(_ asset: PHAsset, id: String) -> [String: Any] {
    var result: [String: Any] = [
      "photoId": id,
      "analysisVersion": 1,
      "modelVersion": "ios-vision-1",
      "analyzedAt": Int(Date().timeIntervalSince1970 * 1000),
      "isScreenshot": asset.mediaSubtypes.contains(.photoScreenshot)
    ]
    if let image = requestImage(asset, size: 224), let cgImage = image.cgImage {
      let metrics = imageMetrics(cgImage)
      result["blurScore"] = metrics.blur
      result["qualityScore"] = 1.0 - metrics.blur
      result["brightnessScore"] = metrics.brightness
      result["perceptualHash"] = metrics.hash
      if asset.mediaType == .image, let text = recognizeText(cgImage), !text.isEmpty { result["ocrText"] = String(text.prefix(10000)) }
    }
    if asset.mediaType == .image, let hash = contentHash(asset) { result["contentHash"] = hash }
    return result
  }

  private func requestImage(_ asset: PHAsset, size: CGFloat) -> UIImage? {
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.isNetworkAccessAllowed = false
    options.deliveryMode = .fastFormat
    options.resizeMode = .fast
    var image: UIImage?
    PHImageManager.default().requestImage(
      for: asset,
      targetSize: CGSize(width: size, height: size),
      contentMode: .aspectFit,
      options: options
    ) { value, _ in image = value }
    return image
  }

  private func imageMetrics(_ image: CGImage) -> (blur: Double, brightness: Double, hash: String) {
    let size = 32
    var pixels = [UInt8](repeating: 0, count: size * size)
    guard let context = CGContext(
      data: &pixels,
      width: size,
      height: size,
      bitsPerComponent: 8,
      bytesPerRow: size,
      space: CGColorSpaceCreateDeviceGray(),
      bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else { return (1, 0, "") }
    context.interpolationQuality = .low
    context.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
    let average = pixels.reduce(0, { $0 + Int($1) }) / pixels.count
    var hash = ""
    for block in 0..<16 {
      var value = 0
      for bit in 0..<4 { value = (value << 1) | (Int(pixels[block * 4 + bit]) >= average ? 1 : 0) }
      hash += String(format: "%x", value)
    }
    var edge = 0.0
    var count = 0
    for y in 1..<(size - 1) {
      for x in 1..<(size - 1) {
        let index = y * size + x
        let laplacian = 4 * Int(pixels[index]) - Int(pixels[index - 1]) - Int(pixels[index + 1]) - Int(pixels[index - size]) - Int(pixels[index + size])
        edge += abs(Double(laplacian))
        count += 1
      }
    }
    let blur = max(0, min(1, 1 - edge / Double(count) / 80))
    let light = Double(average) / 255
    let brightness = max(0, min(1, 1 - abs(light - 0.5) * 2))
    return (blur, brightness, hash)
  }

  private func recognizeText(_ image: CGImage) -> String? {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .fast
    request.usesLanguageCorrection = false
    do {
      try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
      return request.results?.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
    } catch { return nil }
  }

  private func contentHash(_ asset: PHAsset) -> String? {
    guard let resource = PHAssetResource.assetResources(for: asset).first else { return nil }
    var hasher = SHA256()
    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = false
    let semaphore = DispatchSemaphore(value: 0)
    PHAssetResourceManager.default().requestData(for: resource, options: options, dataReceivedHandler: { data in
      hasher.update(data: data)
    }) { _ in semaphore.signal() }
    semaphore.wait()
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }
  func photoLibraryDidChange(_ changeInstance: PHChange) {
    lock.lock(); defer { lock.unlock() }
    snapshot = nil
    generation = UUID().uuidString
  }
  func listAssets(limit: Int, cursor: String?, category: String = "all", before: Double? = nil) throws -> [String: Any] {
    guard (1...200).contains(limit) else { throw LibraryReadError.invalidCursor }
    guard ["all", "photos", "videos", "screenshots", "favorites"].contains(category) else { throw LibraryReadError.invalidCursor }
    if let before { guard before.isFinite, before >= 1, before <= 8640000000000000, before.rounded() == before else { throw LibraryReadError.invalidCursor } }
    let key = "\(category):\(before ?? 0)"
    lock.lock(); defer { lock.unlock() }
    var offset = 0
    if let cursor {
      let parts = cursor.split(separator: ":")
      guard parts.count == 2, String(parts[0]) == generation, key == queryKey,
        let value = Int(parts[1]), value >= 0, snapshot != nil else { throw LibraryReadError.invalidCursor }
      offset = value
    } else {
      let options = PHFetchOptions()
      var predicates = [NSPredicate(format: "mediaType == %d OR mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)]
      switch category {
      case "photos": predicates.append(NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue))
      case "videos": predicates.append(NSPredicate(format: "mediaType == %d", PHAssetMediaType.video.rawValue))
      case "screenshots": predicates.append(NSPredicate(format: "(mediaSubtypes & %d) != 0", PHAssetMediaSubtype.photoScreenshot.rawValue))
      case "favorites": predicates.append(NSPredicate(format: "favorite == YES"))
      default: break
      }
      if let before { predicates.append(NSPredicate(format: "creationDate < %@", NSDate(timeIntervalSince1970: before / 1000))) }
      options.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
      options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
      snapshot = PHAsset.fetchAssets(with: options)
      generation = UUID().uuidString
      queryKey = key
    }
    guard let snapshot, offset <= snapshot.count else { throw LibraryReadError.invalidCursor }
    let end = min(snapshot.count, offset + limit)
    var assets = [[String: Any]]()
    for index in offset..<end {
      let asset = snapshot.object(at: index)
      let id = "ios:" + Data(asset.localIdentifier.utf8).base64EncodedString()
      var row: [String: Any] = [
        "id": id, "mediaType": asset.mediaType == .video ? "video" : "photo",
        "createdAt": max(0, (asset.creationDate?.timeIntervalSince1970 ?? 0) * 1000),
        "width": asset.pixelWidth, "height": asset.pixelHeight, "isFavorite": asset.isFavorite
      ]
      if let date = asset.modificationDate { row["modifiedAt"] = max(0, date.timeIntervalSince1970 * 1000) }
      if asset.mediaType == .video { row["duration"] = asset.duration }
      assets.append(row)
    }
    var result: [String: Any] = ["assets": assets]
    if end < snapshot.count { result["nextCursor"] = "\(generation):\(end)" }
    return result
  }

  func thumbnail(id: String, size: Int) throws -> String {
    guard (32...512).contains(size), id.hasPrefix("ios:"),
      let data = Data(base64Encoded: String(id.dropFirst(4))),
      let identifier = String(data: data, encoding: .utf8) else { throw LibraryReadError.missingAsset }
    lock.lock(); defer { lock.unlock() }
    // Refetch authorization-scoped asset before accessing any cached thumbnail.
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject else { throw LibraryReadError.missingAsset }
    let options = PHImageRequestOptions()
    options.isSynchronous = true
    options.isNetworkAccessAllowed = false
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .exact
    var thumbnail: UIImage?
    PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: CGFloat(size), height: CGFloat(size)), contentMode: .aspectFit, options: options) { image, _ in thumbnail = image }
    guard let jpeg = thumbnail?.jpegData(compressionQuality: 0.8) else { throw LibraryReadError.missingAsset }
    let manager = FileManager.default
    let directory = try manager.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("seleva-thumbnails", isDirectory: true)
    try manager.createDirectory(at: directory, withIntermediateDirectories: true)
    let keys: Set<URLResourceKey> = [.fileSizeKey, .contentModificationDateKey]
    let files = try manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: Array(keys)).map { ($0, try $0.resourceValues(forKeys: keys)) }.sorted { ($0.1.contentModificationDate ?? .distantPast) < ($1.1.contentModificationDate ?? .distantPast) }
    var bytes = files.reduce(0) { $0 + ($1.1.fileSize ?? 0) }
    var count = files.count
    for (file, values) in files {
      if bytes + jpeg.count <= 24 * 1024 * 1024 && count < 200 { break }
      try manager.removeItem(at: file)
      bytes -= values.fileSize ?? 0
      count -= 1
    }
    let hash = SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()
    let destination = directory.appendingPathComponent("\(hash)-\(size).jpg")
    try jpeg.write(to: destination, options: .atomic)
    return destination.absoluteString
  }

  func trashAssets(ids: [String]) throws -> [String: Any] {
    let identifiers = ids.compactMap { id -> String? in
      guard id.hasPrefix("ios:"),
            let data = Data(base64Encoded: String(id.dropFirst(4))) else { return nil }
      return String(data: data, encoding: .utf8)
    }
    let assets = PHAsset.fetchAssets(withLocalIdentifiers: identifiers, options: nil)
    var items = [PHAsset]()
    assets.enumerateObjects { asset, _, _ in items.append(asset) }
    if !items.isEmpty {
      try PHPhotoLibrary.shared().performChangesAndWait {
        PHAssetChangeRequest.deleteAssets(items as NSArray)
      }
    }
    return ["trashedIds": ids, "cancelled": false]
  }
}
