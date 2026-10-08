import ExpoModulesCore
import Photos

final class PhotosAccessDeniedException: Exception {
  override var reason: String { "Drift needs permission to add photos to save a Live Photo" }
}

public class DriftWallpaperModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DriftWallpaper")

    // iOS gives apps no way to read or set the wallpaper.
    Function("isActive") { false }

    /// Renders the wallpaper described by `spec` (JSON from `nativeSpec()`) as a Live Photo and adds
    /// it to the photo library. The user then sets it in Settings › Wallpaper.
    AsyncFunction("saveLivePhoto") { (spec: String) async throws -> String in
      let decoded = try JSONDecoder().decode(WallpaperSpec.self, from: Data(spec.utf8))
      let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
      guard status == .authorized || status == .limited else { throw PhotosAccessDeniedException() }

      let size = await MainActor.run { LivePhotoMaker.screenPixels() }
      let files = try await LivePhotoMaker(spec: decoded, size: size).render()
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
