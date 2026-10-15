import ExpoModulesCore
import Photos

final class PhotosAccessDeniedException: Exception {
  override var reason: String { "Drift needs permission to add photos to save a Live Photo" }
}

final class VideoDownloadException: Exception {
  override var reason: String { "Could not download the wallpaper" }
}

/// The wallpaper's video, downloaded to a temporary file the caller removes.
private func downloadVideo(_ link: String) async throws -> URL {
  guard let url = URL(string: link), url.scheme == "https" else { throw VideoDownloadException() }
  let (tmp, response) = try await URLSession.shared.download(from: url)
  guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
    try? FileManager.default.removeItem(at: tmp)
    throw VideoDownloadException()
  }
  // AVFoundation goes by the extension.
  let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).mp4")
  try FileManager.default.moveItem(at: tmp, to: file)
  return file
}

public class DriftWallpaperModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DriftWallpaper")

    // iOS gives apps no way to read or set the wallpaper.
    Function("isActive") { false }

    /// Renders the wallpaper described by `spec` (JSON from `nativeSpec()`) as a Live Photo and adds
    /// it to the photo library: three seconds of its video, or of its generated art. The user then
    /// sets it in Settings › Wallpaper.
    AsyncFunction("saveLivePhoto") { (spec: String) async throws -> String in
      let decoded = try JSONDecoder().decode(WallpaperSpec.self, from: Data(spec.utf8))
      let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
      guard status == .authorized || status == .limited else { throw PhotosAccessDeniedException() }

      let size = await MainActor.run { LivePhotoMaker.screenPixels() }
      var video: URL?
      if let link = decoded.video { video = try await downloadVideo(link) }
      defer { if let video { try? FileManager.default.removeItem(at: video) } }
      let files = try await LivePhotoMaker(spec: decoded, size: size, videoFile: video).render()
      defer { files.remove() }

      try await PHPhotoLibrary.shared().performChanges {
        let request = PHAssetCreationRequest.forAsset()
        request.addResource(with: .photo, fileURL: files.photo, options: nil)
        request.addResource(with: .pairedVideo, fileURL: files.video, options: nil)
      }
      return "saved"
    }
  }
}
