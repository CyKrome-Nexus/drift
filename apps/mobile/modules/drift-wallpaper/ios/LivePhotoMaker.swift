import AVFoundation
import CoreGraphics
import ExpoModulesCore
import ImageIO
import UIKit
import UniformTypeIdentifiers

/// What the app hands the native side: `nativeSpec()` in `src/lib/wallpaper.ts`. A provider's
/// wallpaper has a `video` URL (the module downloads it); the art fields are generated art.
struct WallpaperSpec: Decodable {
  struct Base: Decodable { let angle: Double; let from: String; let to: String }
  struct Layer: Decodable { let x: Double; let y: Double; let color: String; let fade: Double; let shape: String }
  let name: String
  let video: String?
  let base: Base
  let layers: [Layer]
  let overscanX: Double
  let overscanY: Double
}

struct LivePhotoFiles {
  let photo: URL
  let video: URL
  func remove() {
    try? FileManager.default.removeItem(at: photo)
    try? FileManager.default.removeItem(at: video)
  }
}

final class LivePhotoWriteException: Exception {
  override var reason: String { "Could not render the Live Photo" }
}

/// A Live Photo is a JPEG and a QuickTime movie that carry the same content identifier, plus a
/// timed "still image time" marker in the movie saying which frame the photo is.
///
/// Its frames come from the provider's video (`videoFile`: three seconds from a quarter of the
/// way in, cropped to fill the screen) or, for generated art, are painted from the spec.
struct LivePhotoMaker {
  let spec: WallpaperSpec
  let size: CGSize
  var videoFile: URL? = nil

  static let seconds = 3.0
  static let fps: Int32 = 30
  /// The slice of the art's drift the clip covers; the full drift takes the app 28 s.
  static let driftFrom = 0.15
  static let driftSpan = 0.3

  @MainActor static func screenPixels() -> CGSize {
    let px = UIScreen.main.nativeBounds.size
    // H.264 wants even dimensions; portrait, whatever the current orientation.
    let w = min(px.width, px.height), h = max(px.width, px.height)
    return CGSize(width: floor(w / 2) * 2, height: floor(h / 2) * 2)
  }

  func render() async throws -> LivePhotoFiles {
    let id = UUID().uuidString
    let dir = FileManager.default.temporaryDirectory
    let files = LivePhotoFiles(photo: dir.appendingPathComponent("\(id).jpg"), video: dir.appendingPathComponent("\(id).mov"))
    do {
      let frames = try await videoFrames()
      try await writeVideo(to: files.video, id: id, frames: frames)
      try await writePhoto(to: files.photo, id: id, frames: frames)
    } catch {
      files.remove()
      throw error
    }
    return files
  }

  // MARK: - Video frames

  /// Reads the frames of the clip from the downloaded video; nil for generated art.
  struct VideoFrames {
    let generator: AVAssetImageGenerator
    let start: CMTime

    func image(frame: Int) async throws -> CGImage {
      let at = CMTimeAdd(start, CMTime(value: CMTimeValue(frame), timescale: LivePhotoMaker.fps))
      return try await generator.image(at: at).image
    }
  }

  private func videoFrames() async throws -> VideoFrames? {
    guard let videoFile else { return nil }
    let asset = AVURLAsset(url: videoFile)
    let duration = try await asset.load(.duration).seconds
    guard duration.isFinite, duration > 0 else { throw LivePhotoWriteException() }
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    // A frame either side is close enough at 30 fps, and far faster than an exact seek.
    let tolerance = CMTime(value: 1, timescale: Self.fps)
    generator.requestedTimeToleranceBefore = tolerance
    generator.requestedTimeToleranceAfter = tolerance
    // A quarter of the way in skips fades and title cards; short clips start at the top.
    let start = max(0, min(duration * 0.25, duration - Self.seconds))
    return VideoFrames(generator: generator, start: CMTime(seconds: start, preferredTimescale: 600))
  }

  /// `image` scaled to cover the frame, centred. Expects the context's default bottom-left origin.
  private func drawFilling(_ image: CGImage, in ctx: CGContext) {
    let iw = CGFloat(image.width), ih = CGFloat(image.height)
    let scale = max(size.width / iw, size.height / ih)
    let w = iw * scale, h = ih * scale
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h))
  }

  /// Frame `frame` of `count` into `ctx` (bottom-left origin): video, or painted art.
  private func paint(frame: Int, of count: Int, in ctx: CGContext, frames: VideoFrames?) async throws {
    if let frames {
      drawFilling(try await frames.image(frame: frame), in: ctx)
      return
    }
    ctx.saveGState()
    ctx.translateBy(x: 0, y: size.height)
    ctx.scaleBy(x: 1, y: -1)
    draw(in: ctx, t: position(frame: frame, of: count))
    ctx.restoreGState()
  }

  // MARK: - Drawing

  private static func ease(_ t: Double) -> Double { t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2 }

  private func position(frame: Int, of count: Int) -> Double {
    Self.driftFrom + Self.driftSpan * Self.ease(Double(frame) / Double(max(count - 1, 1)))
  }

  /// Same geometry as the app's SVG `Art` and the Android renderer. Expects a top-left origin.
  private func draw(in ctx: CGContext, t: Double) {
    let w = size.width, h = size.height
    let artW = w * spec.overscanX, artH = h * spec.overscanY
    let space = CGColorSpaceCreateDeviceRGB()
    ctx.saveGState()
    ctx.translateBy(x: t * (w - artW), y: t * (h - artH))
    ctx.clip(to: CGRect(x: 0, y: 0, width: artW, height: artH))

    let rad = spec.base.angle * .pi / 180
    let dx = sin(rad) / 2, dy = -cos(rad) / 2
    if let base = CGGradient(colorsSpace: space, colors: [color(spec.base.from), color(spec.base.to)] as CFArray, locations: [0, 1]) {
      ctx.drawLinearGradient(
        base,
        start: CGPoint(x: artW * (0.5 - dx), y: artH * (0.5 - dy)),
        end: CGPoint(x: artW * (0.5 + dx), y: artH * (0.5 + dy)),
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    }

    for l in spec.layers.reversed() {
      let cx = l.x / 100 * artW, cy = l.y / 100 * artH
      let fx = max(cx, artW - cx), fy = max(cy, artH - cy)
      let rx = l.shape == "circle" ? hypot(fx, fy) : fx * 2.0.squareRoot()
      let ry = l.shape == "circle" ? rx : fy * 2.0.squareRoot()
      let c = color(l.color)
      guard let g = CGGradient(colorsSpace: space, colors: [c, c.copy(alpha: 0)!] as CFArray, locations: [0, l.fade / 100]) else { continue }
      ctx.saveGState()
      ctx.translateBy(x: cx, y: cy)
      ctx.scaleBy(x: 1, y: ry / rx)
      ctx.drawRadialGradient(g, startCenter: .zero, startRadius: 0, endCenter: .zero, endRadius: rx, options: [.drawsBeforeStartLocation])
      ctx.restoreGState()
    }
    ctx.restoreGState()
  }

  private func color(_ hex: String) -> CGColor {
    let v = UInt32(hex.dropFirst(), radix: 16) ?? 0
    return CGColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
  }

  // MARK: - Movie

  private func writeVideo(to url: URL, id: String, frames: VideoFrames?) async throws {
    let writer = try AVAssetWriter(outputURL: url, fileType: .mov)

    let identifier = AVMutableMetadataItem()
    identifier.keySpace = .quickTimeMetadata
    identifier.key = "com.apple.quicktime.content.identifier" as NSString
    identifier.value = id as NSString
    identifier.dataType = "com.apple.metadata.datatype.UTF-8"
    writer.metadata = [identifier]

    let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: size.width,
      AVVideoHeightKey: size.height,
    ])
    video.expectsMediaDataInRealTime = false
    let pixels = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: size.width,
      kCVPixelBufferHeightKey as String: size.height,
    ])

    let stillSpec: NSDictionary = [
      kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier: "mdta/com.apple.quicktime.still-image-time",
      kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType: "com.apple.metadata.datatype.int8",
    ]
    var stillFormat: CMFormatDescription?
    CMMetadataFormatDescriptionCreateWithMetadataSpecifications(
      allocator: kCFAllocatorDefault, metadataType: kCMMetadataFormatType_Boxed,
      metadataSpecifications: [stillSpec] as CFArray, formatDescriptionOut: &stillFormat)
    let meta = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: stillFormat)
    let metaAdaptor = AVAssetWriterInputMetadataAdaptor(assetWriterInput: meta)

    guard writer.canAdd(video), writer.canAdd(meta) else { throw LivePhotoWriteException() }
    writer.add(video)
    writer.add(meta)
    guard writer.startWriting() else { throw writer.error ?? LivePhotoWriteException() }
    writer.startSession(atSourceTime: .zero)

    let count = Int(Self.seconds * Double(Self.fps))
    let stillItem = AVMutableMetadataItem()
    stillItem.keySpace = AVMetadataKeySpace(rawValue: "mdta")
    stillItem.key = "com.apple.quicktime.still-image-time" as NSString
    stillItem.value = 0 as NSNumber
    stillItem.dataType = "com.apple.metadata.datatype.int8"
    let stillAt = CMTime(value: CMTimeValue(count / 2), timescale: Self.fps)
    metaAdaptor.append(AVTimedMetadataGroup(items: [stillItem], timeRange: CMTimeRange(start: stillAt, duration: CMTime(value: 1, timescale: Self.fps))))
    meta.markAsFinished()

    for frame in 0..<count {
      while !video.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
      guard let pool = pixels.pixelBufferPool else { throw writer.error ?? LivePhotoWriteException() }
      var buffer: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
      guard let buffer else { throw LivePhotoWriteException() }
      CVPixelBufferLockBaseAddress(buffer, [])
      defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
      if let ctx = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer), width: Int(size.width), height: Int(size.height), bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
      {
        try await paint(frame: frame, of: count, in: ctx, frames: frames)
      }
      guard pixels.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: Self.fps)) else {
        throw writer.error ?? LivePhotoWriteException()
      }
    }
    video.markAsFinished()
    await writer.finishWriting()
    if writer.status != .completed { throw writer.error ?? LivePhotoWriteException() }
  }

  // MARK: - Photo

  private func writePhoto(to url: URL, id: String, frames: VideoFrames?) async throws {
    let count = Int(Self.seconds * Double(Self.fps))
    guard let ctx = CGContext(
      data: nil, width: Int(size.width), height: Int(size.height), bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { throw LivePhotoWriteException() }
    // The movie's still-image-time marker is its middle frame; the photo is that frame.
    try await paint(frame: count / 2, of: count, in: ctx, frames: frames)
    guard let image = ctx.makeImage(),
          let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
    else { throw LivePhotoWriteException() }
    // Maker note 17 is the Live Photo content identifier; it must match the movie's.
    let props: NSDictionary = [
      kCGImagePropertyMakerAppleDictionary: ["17": id],
      kCGImageDestinationLossyCompressionQuality: 0.92,
    ]
    CGImageDestinationAddImage(dest, image, props)
    guard CGImageDestinationFinalize(dest) else { throw LivePhotoWriteException() }
  }
}
