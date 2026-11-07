// Turns an exported MP4 into a Live Photo (a still and a short video that
// Photos pairs by a shared identifier), the one moving picture an iPhone
// takes as a wallpaper: on the lock screen it plays when the phone wakes.
// macOS only (AVFoundation and ImageIO).
//   swift scripts/livephoto.swift IN.mp4 OUT_DIR [SECONDS]
// Writes OUT_DIR/NAME.heic and OUT_DIR/NAME.mov. Send both to the phone
// (AirDrop them together, or import both into Photos on the Mac and let
// iCloud sync them), then Settings → Wallpaper → Add New → Photos.
import AVFoundation
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ msg: String) -> Never { FileHandle.standardError.write((msg + "\n").data(using: .utf8)!); exit(1) }

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: swift livephoto.swift IN.mp4 OUT_DIR [SECONDS]") }
let input = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
let seconds = args.count > 3 ? (Double(args[3]) ?? 3) : 3
let name = input.deletingPathExtension().lastPathComponent
let id = UUID().uuidString
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let stillURL = outDir.appendingPathComponent("\(name).heic")
let movURL = outDir.appendingPathComponent("\(name).mov")
try? FileManager.default.removeItem(at: movURL)

let asset = AVURLAsset(url: input)
let sem = DispatchSemaphore(value: 0)

// The still: the first frame, carrying the identifier in Apple's maker note (key 17).
func writeStill() async throws {
  let gen = AVAssetImageGenerator(asset: asset)
  gen.appliesPreferredTrackTransform = true
  gen.requestedTimeToleranceBefore = .zero
  gen.requestedTimeToleranceAfter = .zero
  let (image, _) = try await gen.image(at: .zero)
  guard let dest = CGImageDestinationCreateWithURL(stillURL as CFURL, UTType.heic.identifier as CFString, 1, nil) else { fail("can't write \(stillURL.path)") }
  let props: [CFString: Any] = [kCGImagePropertyMakerAppleDictionary: ["17": id], kCGImageDestinationLossyCompressionQuality: 0.92]
  CGImageDestinationAddImage(dest, image, props as CFDictionary)
  guard CGImageDestinationFinalize(dest) else { fail("can't write \(stillURL.path)") }
}

// The video: the first SECONDS, copied as they are (no re-encode), with the
// identifier and a still-image-time marker that says which frame the still is.
func writeVideo() async throws {
  guard let track = try await asset.loadTracks(withMediaType: .video).first else { fail("no video in \(input.path)") }
  let duration = try await asset.load(.duration)
  let span = CMTimeMinimum(duration, CMTime(seconds: seconds, preferredTimescale: 600))
  let reader = try AVAssetReader(asset: asset)
  reader.timeRange = CMTimeRange(start: .zero, duration: span)
  let out = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
  reader.add(out)

  let writer = try AVAssetWriter(outputURL: movURL, fileType: .mov)
  let ident = AVMutableMetadataItem()
  ident.keySpace = .quickTimeMetadata
  ident.key = "com.apple.quicktime.content.identifier" as NSString
  ident.value = id as NSString
  ident.dataType = "com.apple.metadata.datatype.UTF-8"
  writer.metadata = [ident]

  let fmt = try await track.load(.formatDescriptions).first
  let videoIn = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: fmt)
  videoIn.expectsMediaDataInRealTime = false
  videoIn.transform = try await track.load(.preferredTransform)
  writer.add(videoIn)

  let spec: [String: Any] = [
    kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier as String: "mdta/com.apple.quicktime.still-image-time",
    kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType as String: "com.apple.metadata.datatype.int8",
  ]
  var desc: CMFormatDescription?
  CMMetadataFormatDescriptionCreateWithMetadataSpecifications(allocator: kCFAllocatorDefault, metadataType: kCMMetadataFormatType_Boxed, metadataSpecifications: [spec] as CFArray, formatDescriptionOut: &desc)
  let metaIn = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: desc)
  let adaptor = AVAssetWriterInputMetadataAdaptor(assetWriterInput: metaIn)
  writer.add(metaIn)

  guard writer.startWriting(), reader.startReading() else { fail("can't convert: \(writer.error?.localizedDescription ?? reader.error?.localizedDescription ?? "?")") }
  writer.startSession(atSourceTime: .zero)

  let still = AVMutableMetadataItem()
  still.key = "com.apple.quicktime.still-image-time" as NSString
  still.keySpace = .quickTimeMetadata
  still.value = -1 as NSNumber
  still.dataType = "com.apple.metadata.datatype.int8"
  adaptor.append(AVTimedMetadataGroup(items: [still], timeRange: CMTimeRange(start: .zero, duration: CMTime(value: 1, timescale: 600))))
  metaIn.markAsFinished()

  while let buf = out.copyNextSampleBuffer() {
    while !videoIn.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
    videoIn.append(buf)
  }
  videoIn.markAsFinished()
  await writer.finishWriting()
  if writer.status != .completed { fail("can't write \(movURL.path): \(writer.error?.localizedDescription ?? "?")") }
}

Task {
  do {
    try await writeStill()
    try await writeVideo()
    print(stillURL.path)
    print(movURL.path)
  } catch { fail("\(error)") }
  sem.signal()
}
sem.wait()
