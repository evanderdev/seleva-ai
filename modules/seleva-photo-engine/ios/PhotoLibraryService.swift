import Photos
import UIKit
import CryptoKit

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
}
