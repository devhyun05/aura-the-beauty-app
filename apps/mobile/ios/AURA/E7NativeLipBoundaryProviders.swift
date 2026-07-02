import Foundation
import ImageIO
import React
import UIKit
import Vision

#if canImport(MediaPipeTasksVision)
import MediaPipeTasksVision
#endif

@objc(E7NativeLipBoundaryProviders)
final class E7NativeLipBoundaryProviders: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(extractLipBoundary:resolver:rejecter:)
  func extractLipBoundary(
    _ requestJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      let request = try parseRequest(requestJson)
      if request.provider == "mediapipe" {
        resolve(try extractMediaPipeBoundary(request))
        return
      }

      let frameUrl = try resolveAppFilePath(request.framePath)
      let exportUrl = try resolveAppFilePath(request.arFaceExportPath)
      let imageSource = CGImageSourceCreateWithURL(frameUrl as CFURL, nil)
      guard let imageSource,
            let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        throw E7NativeProviderError.invalidFrameImage(request.framePath)
      }

      let landmarks = try extractVisionFaceLandmarks(
        cgImage: cgImage,
        orientation: request.orientation
      )
      let artifactUrl = try saveProviderArtifact(
        makeVisionFaceLandmarksArtifact(
          request: request,
          frameUrl: frameUrl,
          exportUrl: exportUrl,
          width: cgImage.width,
          height: cgImage.height,
          landmarks: landmarks
        ),
        provider: "vision",
        frameUrl: frameUrl
      )
      let arFaceExport = try readJsonObject(exportUrl)
      let result: [String: Any] = [
        "status": landmarks.outerPoints.count >= 3 ? "ready" : "blocked",
        "provider": "vision",
        "captureSetId": request.captureSetId,
        "capturePairId": request.capturePairId,
        "captureShotKind": request.captureShotKind,
        "framePath": request.framePath,
        "framePreviewUri": frameUrl.absoluteString,
        "arFaceExportPath": request.arFaceExportPath,
        "fullFaceLandmarksPath": artifactUrl.path,
        "debugArtifacts": [
          "fullFaceLandmarks": artifactUrl.path
        ],
        "frameWidth": cgImage.width,
        "frameHeight": cgImage.height,
        "boundary": [
          "coordinateSpace": "frame_image_pixel_top_left",
          "outerPoints": landmarks.outerPoints,
          "innerPoints": landmarks.innerPoints,
          "source": "vision",
          "generationMethod": "native_vision_curve_landmarks"
        ],
        "faceLandmarks": [
          "provider": "vision",
          "coordinateSpace": "frame_image_pixel_top_left",
          "faceBoundingBox": landmarks.faceBoundingBox,
          "contours": landmarks.contours
        ],
        "arFaceExport": arFaceExport,
        "blendShapes": arFaceExport["blendShapes"] as? [String: Any] ?? [
          "available": false,
          "reason": "blendShapes_missing_from_arface_export"
        ],
        "warnings": [
          "native_vision_current_frame",
          "uv_projection_runs_in_rn_js_once_per_generate"
        ]
      ]
      resolve(try jsonString(result))
    } catch {
      reject(
        "E7_NATIVE_PROVIDER_FAILED",
        error.localizedDescription,
        error
      )
    }
  }

  private func extractMediaPipeBoundary(_ request: E7NativeBoundaryRequest) throws -> String {
    let frameUrl = try resolveAppFilePath(request.framePath)
    let exportUrl = try resolveAppFilePath(request.arFaceExportPath)
    let imageSource = CGImageSourceCreateWithURL(frameUrl as CFURL, nil)
    guard let imageSource,
          let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
      throw E7NativeProviderError.invalidFrameImage(request.framePath)
    }
    let arFaceExport = try readJsonObject(exportUrl)

    #if canImport(MediaPipeTasksVision)
    let landmarks = try extractMediaPipeFaceLandmarks(
      frameUrl: frameUrl,
      width: cgImage.width,
      height: cgImage.height
    )
    let artifactUrl = try saveProviderArtifact(
      makeMediaPipeFaceLandmarksArtifact(
        request: request,
        frameUrl: frameUrl,
        exportUrl: exportUrl,
        width: cgImage.width,
        height: cgImage.height,
        landmarks: landmarks
      ),
      provider: "mediapipe",
      frameUrl: frameUrl
    )
    let result: [String: Any] = [
      "status": landmarks.outerPoints.count >= 3 ? "ready" : "blocked",
      "provider": "mediapipe",
      "captureSetId": request.captureSetId,
      "capturePairId": request.capturePairId,
      "captureShotKind": request.captureShotKind,
      "framePath": request.framePath,
      "framePreviewUri": frameUrl.absoluteString,
      "arFaceExportPath": request.arFaceExportPath,
      "fullFaceLandmarksPath": artifactUrl.path,
      "debugArtifacts": [
        "fullFaceLandmarks": artifactUrl.path
      ],
      "frameWidth": cgImage.width,
      "frameHeight": cgImage.height,
      "boundary": [
        "coordinateSpace": "frame_image_pixel_top_left",
        "outerPoints": landmarks.outerPoints,
        "innerPoints": landmarks.innerPoints,
        "source": "mediapipe",
        "generationMethod": "native_mediapipe_face_landmarker_curve"
      ],
      "faceLandmarks": [
        "provider": "mediapipe",
        "coordinateSpace": "frame_image_pixel_top_left",
        "landmarkCount": landmarks.landmarkPoints.count,
        "namedRegions": landmarks.namedRegions
      ],
      "arFaceExport": arFaceExport,
      "blendShapes": arFaceExport["blendShapes"] as? [String: Any] ?? [
        "available": false,
        "reason": "blendShapes_missing_from_arface_export"
      ],
      "warnings": [
        "native_mediapipe_current_frame",
        "uv_projection_runs_in_rn_js_once_per_generate"
      ]
    ]
    return try jsonString(result)
    #else
    return try jsonString([
      "status": "blocked",
      "provider": "mediapipe",
      "captureSetId": request.captureSetId,
      "capturePairId": request.capturePairId,
      "captureShotKind": request.captureShotKind,
      "framePath": request.framePath,
      "framePreviewUri": frameUrl.absoluteString,
      "arFaceExportPath": request.arFaceExportPath,
      "frameWidth": cgImage.width,
      "frameHeight": cgImage.height,
      "arFaceExport": arFaceExport,
      "warnings": [
        "native_mediapipe_provider_called_current_frame",
        "mediapipe_tasks_vision_module_not_installed"
      ],
      "blockedReason": "mediapipe_tasks_vision_module_not_installed"
    ])
    #endif
  }

  @objc(saveGeneratedPackage:resolver:rejecter:)
  func saveGeneratedPackage(
    _ packageJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      guard let data = packageJson.data(using: .utf8),
            let package = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw E7NativeProviderError.invalidPackageJson
      }
      let generatedMaskId =
        sanitizePathComponent(package["generatedMaskId"] as? String ?? "generated-lip-mask")
      let root = try documentsDirectory()
        .appendingPathComponent("e7-generated-lip-packages", isDirectory: true)
        .appendingPathComponent(generatedMaskId, isDirectory: true)
      try FileManager.default.createDirectory(
        at: root,
        withIntermediateDirectories: true
      )
      let packageUrl = root.appendingPathComponent("generated_lip_package.json")
      try data.write(to: packageUrl, options: .atomic)

      let record: [String: Any] = [
        "schemaVersion": "e7-lip-generate-saved-record-v0",
        "savedAt": isoNow(),
        "generatedMaskId": generatedMaskId,
        "provider": package["provider"] as? String ?? "unknown",
        "expressionMode": package["expressionMode"] as? String ?? "unknown",
        "status": "saved_local_only",
        "packagePath": packageUrl.path,
        "runtimeReady": false,
        "privacyFlags": [
          "localOnly": true,
          "offDeviceUpload": false,
          "longTermRawFrameStored": false
        ]
      ]
      let recordUrl = root.appendingPathComponent("saved_record.json")
      try jsonData(record).write(to: recordUrl, options: .atomic)
      resolve(try jsonString(record.merging(["metadataPath": recordUrl.path]) { _, new in new }))
    } catch {
      reject(
        "E7_SAVE_PACKAGE_FAILED",
        error.localizedDescription,
        error
      )
    }
  }

  @objc(renderLipMaskPreview:resolver:rejecter:)
  func renderLipMaskPreview(
    _ packageJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      guard let data = packageJson.data(using: .utf8),
            let package = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw E7NativeProviderError.invalidPackageJson
      }
      guard let sourceFrameMetadata = package["sourceFrameMetadata"] as? [String: Any],
            let framePath = sourceFrameMetadata["framePath"] as? String,
            !framePath.isEmpty else {
        throw E7NativeProviderError.missingField("sourceFrameMetadata.framePath")
      }
      let runtimeApplyPayload = package["runtimeApplyPayload"] as? [String: Any]
      let arFaceExport: [String: Any]?
      if let arFaceExportPath = sourceFrameMetadata["arFaceExportPath"] as? String,
         !arFaceExportPath.isEmpty {
        arFaceExport = try? readJsonObject(try resolveAppFilePath(arFaceExportPath))
      } else {
        arFaceExport = nil
      }
      guard let lipBoundary = package["lipBoundary2D"] as? [String: Any] else {
        throw E7NativeProviderError.missingField("lipBoundary2D")
      }
      let outerPoints = try parsePreviewPoints(
        lipBoundary["outerPoints"],
        field: "lipBoundary2D.outerPoints"
      )
      let innerPoints = try parsePreviewPoints(
        lipBoundary["innerPoints"],
        field: "lipBoundary2D.innerPoints"
      )
      guard outerPoints.count >= 3 else {
        throw E7NativeProviderError.missingField("lipBoundary2D.outerPoints[3+]")
      }

      let frameUrl = try resolveAppFilePath(framePath)
      let imageSource = CGImageSourceCreateWithURL(frameUrl as CFURL, nil)
      guard let imageSource,
            let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        throw E7NativeProviderError.invalidFrameImage(framePath)
      }

      let width = CGFloat(cgImage.width)
      let height = CGFloat(cgImage.height)
      let rendererFormat = UIGraphicsImageRendererFormat.default()
      rendererFormat.scale = 1
      rendererFormat.opaque = true
      let renderer = UIGraphicsImageRenderer(
        size: CGSize(width: width, height: height),
        format: rendererFormat
      )
      var previewRenderer = "lipBoundary2D_outline_only"
      let renderedImage = renderer.image { context in
        let rect = CGRect(x: 0, y: 0, width: width, height: height)
        UIImage(cgImage: cgImage).draw(in: rect)

        let hasRawUvMaskProjection = renderRawUvMaskProjection(
          context: context.cgContext,
          runtimeApplyPayload: runtimeApplyPayload,
          arFaceExport: arFaceExport
        )
        if hasRawUvMaskProjection {
          previewRenderer = "raw_uv_mask_projection_outline_only"
        }

        let outerStroke = UIBezierPath()
        appendSmoothClosedCurve(points: outerPoints, to: outerStroke)
        UIColor.white.withAlphaComponent(0.92).setStroke()
        outerStroke.lineWidth = max(4, width * 0.004)
        outerStroke.lineJoinStyle = .round
        outerStroke.lineCapStyle = .round
        outerStroke.stroke()

        if innerPoints.count >= 3 {
          let innerStroke = UIBezierPath()
          appendSmoothClosedCurve(points: innerPoints, to: innerStroke)
          UIColor.white.withAlphaComponent(0.68).setStroke()
          innerStroke.lineWidth = max(2, width * 0.0025)
          innerStroke.lineJoinStyle = .round
          innerStroke.lineCapStyle = .round
          innerStroke.stroke()
        }

        context.cgContext.setFillColor(UIColor.black.withAlphaComponent(0.52).cgColor)
        let badgeRect = CGRect(x: 24, y: 24, width: min(width - 48, 560), height: 72)
        let badgePath = UIBezierPath(roundedRect: badgeRect, cornerRadius: 14)
        badgePath.fill()
        let label = "actual generated lip mask preview" as NSString
        label.draw(
          in: badgeRect.insetBy(dx: 18, dy: 18),
          withAttributes: [
            .font: UIFont.systemFont(ofSize: 26, weight: .bold),
            .foregroundColor: UIColor.white
          ]
        )
      }

      guard let pngData = renderedImage.pngData() else {
        throw E7NativeProviderError.invalidFrameImage(framePath)
      }

      let generatedMaskId = sanitizePathComponent(
        package["generatedMaskId"] as? String ?? "generated-lip-mask-preview"
      )
      let outputRoot = try documentsDirectory()
        .appendingPathComponent("e7-generated-lip-previews", isDirectory: true)
      try FileManager.default.createDirectory(
        at: outputRoot,
        withIntermediateDirectories: true
      )
      let outputUrl = outputRoot.appendingPathComponent("\(generatedMaskId).png")
      try pngData.write(to: outputUrl, options: .atomic)

      resolve(try jsonString([
        "status": "ready",
        "generatedMaskId": generatedMaskId,
        "previewPath": outputUrl.path,
	        "previewUri": outputUrl.absoluteString,
	        "framePath": frameUrl.path,
        "previewRenderer": previewRenderer,
	        "outerPointCount": outerPoints.count,
        "innerPointCount": innerPoints.count,
        "privacy": [
          "localOnly": true,
          "offDeviceUpload": false,
          "longTermRawFrameStored": false
        ]
      ]))
    } catch {
      reject(
        "E7_RENDER_PREVIEW_FAILED",
        error.localizedDescription,
        error
      )
    }
  }

  private func parseRequest(_ json: String) throws -> E7NativeBoundaryRequest {
    guard let data = json.data(using: .utf8),
          let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw E7NativeProviderError.invalidRequestJson
    }
    let provider = object["provider"] as? String ?? "vision"
    let captureSetId = object["captureSetId"] as? String ?? "capture-set"
    let capturePairId = object["capturePairId"] as? String ?? "pair_face_unknown"
    let captureShotKind = object["captureShotKind"] as? String ?? "neutral"
    let framePath = object["framePath"] as? String ?? ""
    let arFaceExportPath = object["arFaceExportPath"] as? String ?? ""
    if framePath.isEmpty {
      throw E7NativeProviderError.missingField("framePath")
    }
    if arFaceExportPath.isEmpty {
      throw E7NativeProviderError.missingField("arFaceExportPath")
    }
    return E7NativeBoundaryRequest(
      provider: provider,
      captureSetId: captureSetId,
      capturePairId: capturePairId,
      captureShotKind: captureShotKind,
      framePath: framePath,
      arFaceExportPath: arFaceExportPath,
      orientation: object["orientation"] as? String ?? "up"
    )
  }

  private func resolveAppFilePath(_ value: String) throws -> URL {
    let fileUrl = URL(fileURLWithPath: value)
    if fileUrl.isFileURL, FileManager.default.fileExists(atPath: fileUrl.path) {
      return fileUrl
    }

    let documents = try documentsDirectory()
    let trimmed = value
      .replacingOccurrences(of: "Documents/", with: "")
      .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let url = documents.appendingPathComponent(trimmed)
    if FileManager.default.fileExists(atPath: url.path) {
      return url
    }
    throw E7NativeProviderError.fileNotFound(value)
  }

  private func renderRawUvMaskProjection(
    context _: CGContext,
    runtimeApplyPayload: [String: Any]?,
    arFaceExport: [String: Any]?
  ) -> Bool {
    guard let runtimeApplyPayload,
          let arFaceExport,
          let rawBase64 = runtimeApplyPayload["maskRawRgbaBase64"] as? String,
          let rawData = Data(base64Encoded: rawBase64),
          let maskWidth = intValue(runtimeApplyPayload["maskTextureWidth"]),
          let maskHeight = intValue(runtimeApplyPayload["maskTextureHeight"]),
          maskWidth > 0,
          maskHeight > 0,
          rawData.count >= maskWidth * maskHeight * 4,
          let screenVertices = parseNumberArrayPairs(arFaceExport["screenVertices"]),
          let uvs = parseNumberArrayPairs(arFaceExport["uvs"]),
          let indices = parseIntArray(arFaceExport["indices"]),
          indices.count >= 3 else {
      return false
    }

    var coveredTriangleCount = 0
    for index in stride(from: 0, to: indices.count - 2, by: 3) {
      let i0 = indices[index]
      let i1 = indices[index + 1]
      let i2 = indices[index + 2]
      guard i0 >= 0,
            i1 >= 0,
            i2 >= 0,
            i0 < screenVertices.count,
            i1 < screenVertices.count,
            i2 < screenVertices.count,
            i0 < uvs.count,
            i1 < uvs.count,
            i2 < uvs.count else {
        continue
      }
      let alpha0 = sampleRawMaskAlpha(
        rawData,
        width: maskWidth,
        height: maskHeight,
        uv: uvs[i0]
      )
      let alpha1 = sampleRawMaskAlpha(
        rawData,
        width: maskWidth,
        height: maskHeight,
        uv: uvs[i1]
      )
      let alpha2 = sampleRawMaskAlpha(
        rawData,
        width: maskWidth,
        height: maskHeight,
        uv: uvs[i2]
      )
      let alpha = CGFloat(alpha0 + alpha1 + alpha2) / (255.0 * 3.0)
      if alpha <= 0.03 {
        continue
      }
      coveredTriangleCount += 1
    }
    return coveredTriangleCount > 0
  }

  private func sampleRawMaskAlpha(
    _ rawData: Data,
    width: Int,
    height: Int,
    uv: [CGFloat]
  ) -> Int {
    guard uv.count >= 2 else {
      return 0
    }
    let column = max(0, min(width - 1, Int(round(uv[0] * CGFloat(width - 1)))))
    let row = max(0, min(height - 1, Int(round(uv[1] * CGFloat(height - 1)))))
    let offset = (row * width + column) * 4 + 3
    guard offset >= 0 && offset < rawData.count else {
      return 0
    }
    return Int(rawData[offset])
  }

  private func parseNumberArrayPairs(_ value: Any?) -> [[CGFloat]]? {
    guard let rows = value as? [[Any]] else {
      return nil
    }
    return rows.compactMap { row in
      guard row.count >= 2,
            let x = numericValue(row[0]),
            let y = numericValue(row[1]) else {
        return nil
      }
      return [x, y]
    }
  }

  private func parseIntArray(_ value: Any?) -> [Int]? {
    guard let values = value as? [Any] else {
      return nil
    }
    return values.compactMap { intValue($0) }
  }

  private func parsePreviewPoints(_ value: Any?, field: String) throws -> [CGPoint] {
    guard let rawPoints = value as? [[String: Any]] else {
      throw E7NativeProviderError.missingField(field)
    }
    return try rawPoints.map { rawPoint in
      guard let x = numericValue(rawPoint["x"]),
            let y = numericValue(rawPoint["y"]) else {
        throw E7NativeProviderError.missingField("\(field).x/y")
      }
      return CGPoint(x: x, y: y)
    }
  }

  private func numericValue(_ value: Any?) -> CGFloat? {
    if let number = value as? NSNumber {
      return CGFloat(truncating: number)
    }
    if let doubleValue = value as? Double {
      return CGFloat(doubleValue)
    }
    if let intValue = value as? Int {
      return CGFloat(intValue)
    }
    return nil
  }

  private func intValue(_ value: Any?) -> Int? {
    if let number = value as? NSNumber {
      return number.intValue
    }
    if let intValue = value as? Int {
      return intValue
    }
    if let doubleValue = value as? Double {
      return Int(doubleValue)
    }
    return nil
  }

  private func appendStraightClosedLines(
    points: [CGPoint],
    to path: UIBezierPath
  ) {
    var didMove = false
    for point in points {
      if didMove {
        path.addLine(to: point)
      } else {
        path.move(to: point)
        didMove = true
      }
    }
    if didMove {
      path.close()
    }
  }

  private func appendSmoothClosedCurve<S: Sequence>(
    points: S,
    to path: UIBezierPath
  ) where S.Element == CGPoint {
    let pointList = Array(points)
    guard !pointList.isEmpty else {
      return
    }
    guard pointList.count >= 4 else {
      appendStraightClosedLines(points: pointList, to: path)
      return
    }

    path.move(to: pointList[0])
    for index in 0..<pointList.count {
      let previous = pointList[(index - 1 + pointList.count) % pointList.count]
      let current = pointList[index]
      let next = pointList[(index + 1) % pointList.count]
      let afterNext = pointList[(index + 2) % pointList.count]
      let controlPoint1 = CGPoint(
        x: current.x + (next.x - previous.x) / 6,
        y: current.y + (next.y - previous.y) / 6
      )
      let controlPoint2 = CGPoint(
        x: next.x - (afterNext.x - current.x) / 6,
        y: next.y - (afterNext.y - current.y) / 6
      )
      path.addCurve(
        to: next,
        controlPoint1: controlPoint1,
        controlPoint2: controlPoint2
      )
    }
    path.close()
  }

  private func documentsDirectory() throws -> URL {
    guard let url = FileManager.default.urls(
      for: .documentDirectory,
      in: .userDomainMask
    ).first else {
      throw E7NativeProviderError.documentsDirectoryUnavailable
    }
    return url
  }

  private func readJsonObject(_ url: URL) throws -> [String: Any] {
    let data = try Data(contentsOf: url)
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw E7NativeProviderError.invalidArFaceExport(url.path)
    }
    return object
  }

  private func extractVisionFaceLandmarks(
    cgImage: CGImage,
    orientation: String
  ) throws -> E7VisionFaceLandmarks {
    let request = VNDetectFaceLandmarksRequest()
    let handler = VNImageRequestHandler(
      cgImage: cgImage,
      orientation: cgImageOrientation(orientation),
      options: [:]
    )
    try handler.perform([request])
    guard let face = request.results?.max(by: { $0.confidence < $1.confidence }),
          let landmarks = face.landmarks,
          let outerLips = landmarks.outerLips else {
      throw E7NativeProviderError.visionLipLandmarksMissing
    }

    return E7VisionFaceLandmarks(
      outerPoints: convertLandmarkPoints(
        outerLips,
        faceBoundingBox: face.boundingBox,
        width: cgImage.width,
        height: cgImage.height
      ),
      innerPoints: convertLandmarkPoints(
        landmarks.innerLips,
        faceBoundingBox: face.boundingBox,
        width: cgImage.width,
        height: cgImage.height
      ),
      faceConfidence: Double(face.confidence),
      faceBoundingBox: faceBoundingBoxPayload(face.boundingBox),
      contours: [
        "faceContour": landmarkRegionPayload(
          landmarks.faceContour,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "faceOval": landmarkRegionPayload(
          landmarks.faceContour,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "leftEye": landmarkRegionPayload(
          landmarks.leftEye,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "leftUpperEyelid": landmarkRegionPayload(
          landmarks.leftEye,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "rightEye": landmarkRegionPayload(
          landmarks.rightEye,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "rightUpperEyelid": landmarkRegionPayload(
          landmarks.rightEye,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "leftEyebrow": landmarkRegionPayload(
          landmarks.leftEyebrow,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "rightEyebrow": landmarkRegionPayload(
          landmarks.rightEyebrow,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "nose": landmarkRegionPayload(
          landmarks.nose,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "noseCrest": landmarkRegionPayload(
          landmarks.noseCrest,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "noseBridge": landmarkRegionPayload(
          landmarks.noseCrest,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "medianLine": landmarkRegionPayload(
          landmarks.medianLine,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "outerLips": landmarkRegionPayload(
          landmarks.outerLips,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        ),
        "innerLips": landmarkRegionPayload(
          landmarks.innerLips,
          faceBoundingBox: face.boundingBox,
          width: cgImage.width,
          height: cgImage.height
        )
      ]
    )
  }

  #if canImport(MediaPipeTasksVision)
  private func extractMediaPipeFaceLandmarks(
    frameUrl: URL,
    width: Int,
    height: Int
  ) throws -> E7MediaPipeFaceLandmarks {
    guard let modelPath = Bundle.main.path(
      forResource: "face_landmarker",
      ofType: "task"
    ) else {
      throw E7NativeProviderError.mediapipeModelMissing
    }
    guard let uiImage = UIImage(contentsOfFile: frameUrl.path) else {
      throw E7NativeProviderError.invalidFrameImage(frameUrl.path)
    }

    let options = FaceLandmarkerOptions()
    options.baseOptions.modelAssetPath = modelPath
    options.runningMode = .image
    options.numFaces = 1
    options.outputFaceBlendshapes = false
    options.outputFacialTransformationMatrixes = false
    options.minFaceDetectionConfidence = 0.3
    options.minFacePresenceConfidence = 0.3
    options.minTrackingConfidence = 0.3

    let landmarker = try FaceLandmarker(options: options)
    let image = try MPImage(uiImage: uiImage)
    let result = try landmarker.detect(image: image)
    guard let faceLandmarks = result.faceLandmarks.first else {
      throw E7NativeProviderError.mediapipeNoFaceDetected
    }

    let requiredIndex = [
      mediaPipeOuterLipIndices,
      mediaPipeInnerLipIndices,
      mediaPipeFaceOvalIndices,
      mediaPipeLeftEyeIndices,
      mediaPipeLeftUpperEyelidIndices,
      mediaPipeRightEyeIndices,
      mediaPipeRightUpperEyelidIndices,
      mediaPipeLeftBrowIndices,
      mediaPipeRightBrowIndices,
      mediaPipeLeftDenseBrowIndices,
      mediaPipeRightDenseBrowIndices,
      mediaPipeLeftTempleIndices,
      mediaPipeRightTempleIndices,
      mediaPipeNoseBridgeIndices
    ].compactMap { $0.max() }.max() ?? 0
    if faceLandmarks.count <= requiredIndex {
      throw E7NativeProviderError.mediapipeLandmarkCountTooSmall(
        faceLandmarks.count,
        requiredIndex
      )
    }

    let leftEyebrowAppearance = mediaPipeBrowAppearancePayload(
      uiImage: uiImage,
      landmarks: faceLandmarks,
      coreIndices: mediaPipeLeftBrowIndices,
      eyeIndices: mediaPipeLeftEyeIndices,
      upperEyelidIndices: mediaPipeLeftUpperEyelidIndices,
      side: "left",
      width: width,
      height: height
    )
    let rightEyebrowAppearance = mediaPipeBrowAppearancePayload(
      uiImage: uiImage,
      landmarks: faceLandmarks,
      coreIndices: mediaPipeRightBrowIndices,
      eyeIndices: mediaPipeRightEyeIndices,
      upperEyelidIndices: mediaPipeRightUpperEyelidIndices,
      side: "right",
      width: width,
      height: height
    )

    return E7MediaPipeFaceLandmarks(
      outerPoints: convertMediaPipePoints(
        faceLandmarks,
        indices: mediaPipeOuterLipIndices,
        width: width,
        height: height
      ),
      innerPoints: convertMediaPipePoints(
        faceLandmarks,
        indices: mediaPipeInnerLipIndices,
        width: width,
        height: height
      ),
      landmarkPoints: convertAllMediaPipePoints(
        faceLandmarks,
        width: width,
        height: height
      ),
      namedRegions: [
        "faceOval": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeFaceOvalIndices,
          width: width,
          height: height
        ),
        "leftEye": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeLeftEyeIndices,
          width: width,
          height: height
        ),
        "leftUpperEyelid": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeLeftUpperEyelidIndices,
          width: width,
          height: height
        ),
        "rightEye": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeRightEyeIndices,
          width: width,
          height: height
        ),
        "rightUpperEyelid": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeRightUpperEyelidIndices,
          width: width,
          height: height
        ),
        "leftEyebrow": mediaPipeRegionPayload(
          faceLandmarks,
          browCoreIndices: mediaPipeLeftBrowIndices,
          width: width,
          height: height
        ),
        "leftEyebrowCore": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeLeftBrowIndices,
          width: width,
          height: height
        ),
        "leftEyebrowSurroundAnchors": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeLeftDenseBrowIndices,
          coreIndices: mediaPipeLeftBrowIndices,
          eyeIndices: mediaPipeLeftEyeIndices,
          upperEyelidIndices: mediaPipeLeftUpperEyelidIndices,
          width: width,
          height: height
        ),
        "leftEyebrowAppearance": leftEyebrowAppearance,
        "rightEyebrow": mediaPipeRegionPayload(
          faceLandmarks,
          browCoreIndices: mediaPipeRightBrowIndices,
          width: width,
          height: height
        ),
        "rightEyebrowCore": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeRightBrowIndices,
          width: width,
          height: height
        ),
        "rightEyebrowSurroundAnchors": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeRightDenseBrowIndices,
          coreIndices: mediaPipeRightBrowIndices,
          eyeIndices: mediaPipeRightEyeIndices,
          upperEyelidIndices: mediaPipeRightUpperEyelidIndices,
          width: width,
          height: height
        ),
        "rightEyebrowAppearance": rightEyebrowAppearance,
        "leftTemple": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeLeftTempleIndices,
          width: width,
          height: height
        ),
        "rightTemple": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeRightTempleIndices,
          width: width,
          height: height
        ),
        "noseBridge": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeNoseBridgeIndices,
          width: width,
          height: height
        ),
        "outerLips": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeOuterLipIndices,
          width: width,
          height: height
        ),
        "innerLips": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeInnerLipIndices,
          width: width,
          height: height
        )
      ]
    )
  }

  private func convertMediaPipePoints(
    _ landmarks: [NormalizedLandmark],
    indices: [Int],
    width: Int,
    height: Int
  ) -> [[String: Double]] {
    indices.map { index in
      let landmark = landmarks[index]
      return [
        "x": Double(landmark.x) * Double(width),
        "y": Double(landmark.y) * Double(height),
        "z": Double(landmark.z)
      ]
    }
  }

  private func convertAllMediaPipePoints(
    _ landmarks: [NormalizedLandmark],
    width: Int,
    height: Int
  ) -> [[String: Any]] {
    landmarks.enumerated().map { index, landmark in
      [
        "index": index,
        "x": Double(landmark.x) * Double(width),
        "y": Double(landmark.y) * Double(height),
        "z": Double(landmark.z)
      ]
    }
  }

  private func mediaPipeRegionPayload(
    _ landmarks: [NormalizedLandmark],
    indices: [Int],
    width: Int,
    height: Int
  ) -> [String: Any] {
    let validIndices = indices.filter { $0 < landmarks.count }
    let imagePoints = convertMediaPipePoints(
      landmarks,
      indices: validIndices,
      width: width,
      height: height
    )
    return [
      "status": imagePoints.isEmpty ? "unavailable" : "available",
      "indices": validIndices,
      "pointCount": imagePoints.count,
      "imagePoints": imagePoints
    ]
  }

  private func mediaPipeRegionPayload(
    _ landmarks: [NormalizedLandmark],
    browCoreIndices: [Int],
    width: Int,
    height: Int
  ) -> [String: Any] {
    let corePoints = mediaPipeIndexedPixelPoints(
      landmarks,
      indices: browCoreIndices,
      width: width,
      height: height
    )
    let denseBoundaryPoints = densifyBrowBoundaryPoints(corePoints)
    return [
      "status": denseBoundaryPoints.isEmpty ? "unavailable" : "available",
      "generationMethod": "mediapipe_brow_core_curve_densified_v1",
      "indices": browCoreIndices.filter { $0 < landmarks.count },
      "sourcePointCount": corePoints.count,
      "samplesPerSegment": E7MediaPipeBrowBoundarySamplesPerSegment,
      "pointCount": denseBoundaryPoints.count,
      "imagePoints": denseBoundaryPoints
    ]
  }

  private func mediaPipeRegionPayload(
    _ landmarks: [NormalizedLandmark],
    indices seedIndices: [Int],
    coreIndices: [Int],
    eyeIndices: [Int],
    upperEyelidIndices: [Int],
    width: Int,
    height: Int
  ) -> [String: Any] {
    let corePoints = mediaPipeIndexedPixelPoints(
      landmarks,
      indices: coreIndices,
      width: width,
      height: height
    )
    let eyePoints = mediaPipeIndexedPixelPoints(
      landmarks,
      indices: eyeIndices,
      width: width,
      height: height
    )
    let eyelidPoints = mediaPipeIndexedPixelPoints(
      landmarks,
      indices: upperEyelidIndices,
      width: width,
      height: height
    )

    guard let browBounds = mediaPipeBounds(corePoints),
          let eyeBounds = mediaPipeBounds(eyePoints) else {
      return mediaPipeRegionPayload(
        landmarks,
        indices: coreIndices,
        width: width,
        height: height
      )
    }

    let eyelidBounds = mediaPipeBounds(eyelidPoints) ?? eyeBounds
    let browWidth = max(1.0, browBounds.maxX - browBounds.minX)
    let browHeight = max(1.0, browBounds.maxY - browBounds.minY)
    let eyeHeight = max(1.0, eyeBounds.maxY - eyeBounds.minY)
    let roiMinX = browBounds.minX - browWidth * 0.22
    let roiMaxX = browBounds.maxX + browWidth * 0.22
    let roiMinY = browBounds.minY - max(browHeight * 0.90, eyeHeight * 0.35)
    let eyeGuardTop = min(eyeBounds.minY, eyelidBounds.minY) - eyeHeight * 0.10
    let roiMaxY = min(
      browBounds.maxY + max(browHeight * 0.32, eyeHeight * 0.18),
      eyeGuardTop
    )
    let seedIndexSet = Set(seedIndices + coreIndices)
    var densePoints = [E7MediaPipeIndexedPixelPoint]()

    for (index, landmark) in landmarks.enumerated() {
      let x = Double(landmark.x) * Double(width)
      let y = Double(landmark.y) * Double(height)
      if (x >= roiMinX && x <= roiMaxX && y >= roiMinY && y <= roiMaxY)
        || seedIndexSet.contains(index) {
        densePoints.append(E7MediaPipeIndexedPixelPoint(index: index, x: x, y: y, z: Double(landmark.z)))
      }
    }

    let sortedPoints = sortDenseBrowPoints(densePoints, corePoints: corePoints)
    return [
      "status": sortedPoints.isEmpty ? "unavailable" : "available",
      "generationMethod": "mediapipe_dense_brow_roi_v1",
      "indices": sortedPoints.map(\.index),
      "pointCount": sortedPoints.count,
      "corePointCount": corePoints.count,
      "imagePoints": sortedPoints.map { point in
        [
          "x": point.x,
          "y": point.y,
          "z": point.z
        ]
      }
    ]
  }

  private func mediaPipeBrowAppearancePayload(
    uiImage: UIImage,
    landmarks: [NormalizedLandmark],
    coreIndices: [Int],
    eyeIndices: [Int],
    upperEyelidIndices: [Int],
    side: String,
    width: Int,
    height: Int
  ) -> [String: Any] {
    let fallbackPayload = mediaPipeRegionPayload(
      landmarks,
      browCoreIndices: coreIndices,
      width: width,
      height: height
    )
    guard let sampler = makeBrowImageSampler(uiImage) else {
      return fallbackPayload
    }

    let corePoints = mediaPipeIndexedPixelPoints(
      landmarks,
      indices: coreIndices,
      width: width,
      height: height
    )
    let eyePoints = mediaPipeIndexedPixelPoints(
      landmarks,
      indices: eyeIndices,
      width: width,
      height: height
    )
    let eyelidPoints = mediaPipeIndexedPixelPoints(
      landmarks,
      indices: upperEyelidIndices,
      width: width,
      height: height
    )
    guard let browBounds = mediaPipeBounds(corePoints),
          let eyeBounds = mediaPipeBounds(eyePoints) else {
      return fallbackPayload
    }

    let eyelidBounds = mediaPipeBounds(eyelidPoints) ?? eyeBounds
    let browWidth = max(1.0, browBounds.maxX - browBounds.minX)
    let browHeight = max(1.0, browBounds.maxY - browBounds.minY)
    let eyeHeight = max(1.0, eyeBounds.maxY - eyeBounds.minY)
    let roiMinX = max(0.0, browBounds.minX)
    let roiMaxX = min(Double(width - 1), browBounds.maxX)
    let roiMinY = max(0.0, browBounds.minY - max(browHeight * 0.46, eyeHeight * 0.18))
    let roiMaxY = min(
      Double(height - 1),
      min(
        browBounds.maxY + max(browHeight * 0.26, eyeHeight * 0.10),
        min(eyeBounds.minY, eyelidBounds.minY) - eyeHeight * 0.16
      )
    )
    guard roiMaxX > roiMinX, roiMaxY > roiMinY else {
      return fallbackPayload
    }

    let scaleX = Double(sampler.width) / Double(width)
    let scaleY = Double(sampler.height) / Double(height)
    func luminance(_ x: Double, _ y: Double) -> Double {
      sampler.luminance(x: x * scaleX, y: y * scaleY)
    }

    var roiLumas = [Double]()
    let xStep = max(1, Int((roiMaxX - roiMinX) / 36.0))
    let yStep = max(1, Int((roiMaxY - roiMinY) / 18.0))
    var sampleX = Int(roiMinX.rounded())
    while sampleX <= Int(roiMaxX.rounded()) {
      var sampleY = Int(roiMinY.rounded())
      while sampleY <= Int(roiMaxY.rounded()) {
        roiLumas.append(luminance(Double(sampleX), Double(sampleY)))
        sampleY += yStep
      }
      sampleX += xStep
    }
    let skinBaseline = percentile(roiLumas, percentile: 0.72) ?? 168.0
    let sampleCount = 18
    var upperPoints = [[String: Double]]()
    var lowerPoints = [[String: Double]]()
    var confidenceSum = 0.0
    let sortedCorePoints = corePoints.sorted { first, second in
      first.x == second.x ? first.y < second.y : first.x < second.x
    }

    for sampleIndex in 0..<sampleCount {
      let t = Double(sampleIndex) / Double(sampleCount - 1)
      let x = roiMinX + (roiMaxX - roiMinX) * t
      let predictedY =
        interpolateMediaPipePointY(sortedCorePoints, x: x) ??
        (browBounds.minY + browBounds.maxY) * 0.5
      var bestY = predictedY
      var bestLuma = luminance(x, predictedY)
      var bestScore = -Double.greatestFiniteMagnitude
      let scanMinY = max(
        roiMinY,
        predictedY - max(browHeight * 0.62, eyeHeight * 0.10)
      )
      let scanMaxY = min(
        roiMaxY,
        predictedY + max(browHeight * 0.48, eyeHeight * 0.10)
      )
      var scanY = Int(scanMinY.rounded())
      while scanY <= Int(scanMaxY.rounded()) {
        let y = Double(scanY)
        let currentLuma = luminance(x, y)
        let verticalContrast = max(
          abs(currentLuma - luminance(x, y - 2.0)),
          abs(currentLuma - luminance(x, y + 2.0))
        )
        let distancePenalty = abs(y - predictedY) / max(1.0, roiMaxY - roiMinY) * 0.38
        let darknessScore = max(0.0, skinBaseline - currentLuma) / 255.0
        let score = darknessScore + verticalContrast / 255.0 * 0.24 - distancePenalty
        if score > bestScore {
          bestScore = score
          bestY = y
          bestLuma = currentLuma
        }
        scanY += 1
      }

      if bestScore < 0.02 {
        bestY = predictedY
        bestLuma = luminance(x, predictedY)
      }

      let contrast = max(0.0, skinBaseline - bestLuma) / 255.0
      confidenceSum += max(0.0, min(1.0, bestScore + 0.18))
      let thickness = min(
        max(4.0, browHeight * (0.24 + contrast * 0.82)),
        max(5.0, (roiMaxY - roiMinY) * 0.36)
      )
      let upperY = max(roiMinY, bestY - thickness * 0.48)
      let lowerY = min(roiMaxY, bestY + thickness * 0.52)
      upperPoints.append([
        "x": x,
        "y": upperY,
        "z": 0.0
      ])
      lowerPoints.append([
        "x": x,
        "y": lowerY,
        "z": 0.0
      ])
    }

    let imagePoints = upperPoints + lowerPoints.reversed()
    return [
      "status": imagePoints.isEmpty ? "unavailable" : "available",
      "generationMethod": "image_guided_brow_appearance_roi_v1",
      "side": side,
      "pointCount": imagePoints.count,
      "sampleColumnCount": sampleCount,
      "sourcePointCount": corePoints.count,
      "confidence": confidenceSum / Double(sampleCount),
      "roi": [
        "minX": roiMinX,
        "minY": roiMinY,
        "maxX": roiMaxX,
        "maxY": roiMaxY
      ],
      "imagePoints": imagePoints
    ]
  }

  private func makeBrowImageSampler(_ uiImage: UIImage) -> E7BrowImageSampler? {
    guard let cgImage = uiImage.cgImage else {
      return nil
    }

    let width = cgImage.width
    let height = cgImage.height
    guard width > 0, height > 0 else {
      return nil
    }

    let bytesPerPixel = 4
    let bytesPerRow = width * bytesPerPixel
    var data = [UInt8](repeating: 0, count: height * bytesPerRow)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo =
      CGImageAlphaInfo.premultipliedLast.rawValue |
      CGBitmapInfo.byteOrder32Big.rawValue
    let didDraw = data.withUnsafeMutableBytes { pointer -> Bool in
      guard let context = CGContext(
        data: pointer.baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: bitmapInfo
      ) else {
        return false
      }
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }

    guard didDraw else {
      return nil
    }

    return E7BrowImageSampler(
      bytesPerRow: bytesPerRow,
      data: data,
      height: height,
      width: width
    )
  }

  private func interpolateMediaPipePointY(
    _ points: [E7MediaPipeIndexedPixelPoint],
    x: Double
  ) -> Double? {
    guard let first = points.first else {
      return nil
    }
    if x <= first.x {
      return first.y
    }
    guard let last = points.last else {
      return first.y
    }
    if x >= last.x {
      return last.y
    }

    for index in 1..<points.count {
      let previous = points[index - 1]
      let current = points[index]
      if x <= current.x {
        let deltaX = current.x - previous.x
        let ratio = max(
          0.0,
          min(1.0, (x - previous.x) / (deltaX == 0.0 ? 1.0 : deltaX))
        )
        return previous.y + (current.y - previous.y) * ratio
      }
    }

    return last.y
  }

  private func percentile(_ values: [Double], percentile: Double) -> Double? {
    guard !values.isEmpty else {
      return nil
    }

    let sorted = values.sorted()
    let index = Int(
      max(0.0, min(Double(sorted.count - 1), Double(sorted.count - 1) * percentile))
        .rounded()
    )
    return sorted[index]
  }

  private func mediaPipeIndexedPixelPoints(
    _ landmarks: [NormalizedLandmark],
    indices: [Int],
    width: Int,
    height: Int
  ) -> [E7MediaPipeIndexedPixelPoint] {
    indices.compactMap { index in
      guard index >= 0 && index < landmarks.count else {
        return nil
      }

      let landmark = landmarks[index]
      return E7MediaPipeIndexedPixelPoint(
        index: index,
        x: Double(landmark.x) * Double(width),
        y: Double(landmark.y) * Double(height),
        z: Double(landmark.z)
      )
    }
  }

  private func mediaPipeBounds(
    _ points: [E7MediaPipeIndexedPixelPoint]
  ) -> (minX: Double, minY: Double, maxX: Double, maxY: Double)? {
    guard let first = points.first else {
      return nil
    }

    return points.dropFirst().reduce(
      (minX: first.x, minY: first.y, maxX: first.x, maxY: first.y)
    ) { bounds, point in
      (
        minX: min(bounds.minX, point.x),
        minY: min(bounds.minY, point.y),
        maxX: max(bounds.maxX, point.x),
        maxY: max(bounds.maxY, point.y)
      )
    }
  }

  private func sortDenseBrowPoints(
    _ points: [E7MediaPipeIndexedPixelPoint],
    corePoints: [E7MediaPipeIndexedPixelPoint]
  ) -> [E7MediaPipeIndexedPixelPoint] {
    var uniquePointsByIndex = [Int: E7MediaPipeIndexedPixelPoint]()
    for point in points {
      uniquePointsByIndex[point.index] = point
    }

    let uniquePoints = Array(uniquePointsByIndex.values)
    guard !uniquePoints.isEmpty else {
      return []
    }

    let splitYSource = corePoints.isEmpty ? uniquePoints : corePoints
    let splitY =
      splitYSource.reduce(0.0) { $0 + $1.y } / Double(splitYSource.count)
    let topChain = uniquePoints
      .filter { $0.y <= splitY }
      .sorted { first, second in
        first.x == second.x ? first.y < second.y : first.x < second.x
      }
    let bottomChain = uniquePoints
      .filter { $0.y > splitY }
      .sorted { first, second in
        first.x == second.x ? first.y > second.y : first.x > second.x
      }

    if topChain.isEmpty || bottomChain.isEmpty {
      return uniquePoints.sorted { first, second in
        first.x == second.x ? first.y < second.y : first.x < second.x
      }
    }

    return topChain + bottomChain
  }

  private func densifyBrowBoundaryPoints(
    _ corePoints: [E7MediaPipeIndexedPixelPoint]
  ) -> [[String: Double]] {
    guard corePoints.count >= 4 else {
      return corePoints.map { point in
        [
          "x": point.x,
          "y": point.y,
          "z": point.z
        ]
      }
    }

    let splitY = corePoints.reduce(0.0) { $0 + $1.y } / Double(corePoints.count)
    let topChain = corePoints
      .filter { $0.y <= splitY }
      .sorted { first, second in
        first.x == second.x ? first.y < second.y : first.x < second.x
      }
    let bottomChain = corePoints
      .filter { $0.y > splitY }
      .sorted { first, second in
        first.x == second.x ? first.y > second.y : first.x > second.x
      }

    let boundaryChain = topChain + Array(bottomChain.reversed())
    let chain = boundaryChain.count >= 4
      ? boundaryChain
      : corePoints.sorted { first, second in
        first.x == second.x ? first.y < second.y : first.x < second.x
      }

    return densifyClosedPointChain(
      chain,
      samplesPerSegment: E7MediaPipeBrowBoundarySamplesPerSegment
    )
  }

  private func densifyClosedPointChain(
    _ points: [E7MediaPipeIndexedPixelPoint],
    samplesPerSegment: Int
  ) -> [[String: Double]] {
    guard points.count >= 2 else {
      return points.map { point in
        [
          "x": point.x,
          "y": point.y,
          "z": point.z
        ]
      }
    }

    var result = [[String: Double]]()
    let stepCount = max(1, samplesPerSegment)
    for index in points.indices {
      let start = points[index]
      let end = points[(index + 1) % points.count]
      for step in 0..<stepCount {
        let ratio = Double(step) / Double(stepCount)
        result.append([
          "x": start.x + (end.x - start.x) * ratio,
          "y": start.y + (end.y - start.y) * ratio,
          "z": start.z + (end.z - start.z) * ratio
        ])
      }
    }

    return result
  }
  #endif

  private func convertLandmarkPoints(
    _ region: VNFaceLandmarkRegion2D?,
    faceBoundingBox: CGRect,
    width: Int,
    height: Int
  ) -> [[String: Double]] {
    guard let region else {
      return []
    }
    return region.normalizedPoints.map { point in
      let normalizedX = faceBoundingBox.minX + CGFloat(point.x) * faceBoundingBox.width
      let normalizedY = faceBoundingBox.minY + CGFloat(point.y) * faceBoundingBox.height
      return [
        "x": Double(normalizedX * CGFloat(width)),
        "y": Double((1.0 - normalizedY) * CGFloat(height))
      ]
    }
  }

  private func landmarkRegionPayload(
    _ region: VNFaceLandmarkRegion2D?,
    faceBoundingBox: CGRect,
    width: Int,
    height: Int
  ) -> [String: Any] {
    let imagePoints = convertLandmarkPoints(
      region,
      faceBoundingBox: faceBoundingBox,
      width: width,
      height: height
    )
    return [
      "status": imagePoints.isEmpty ? "unavailable" : "available",
      "pointCount": imagePoints.count,
      "imagePoints": imagePoints
    ]
  }

  private func faceBoundingBoxPayload(_ boundingBox: CGRect) -> [String: Double] {
    [
      "x": Double(boundingBox.minX),
      "y": Double(boundingBox.minY),
      "width": Double(boundingBox.width),
      "height": Double(boundingBox.height)
    ]
  }

  private func makeVisionFaceLandmarksArtifact(
    request: E7NativeBoundaryRequest,
    frameUrl: URL,
    exportUrl: URL,
    width: Int,
    height: Int,
    landmarks: E7VisionFaceLandmarks
  ) -> [String: Any] {
    [
      "schemaVersion": "e7-native-face-landmarks-v0",
      "createdAt": isoNow(),
      "status": "available",
      "provider": "vision",
      "captureSetId": request.captureSetId,
      "capturePairId": request.capturePairId,
      "captureShotKind": request.captureShotKind,
      "framePath": frameUrl.path,
      "arFaceExportPath": exportUrl.path,
      "frameWidth": width,
      "frameHeight": height,
      "coordinateSpaces": [
        "imagePoints": "frame_image_pixel_top_left",
        "faceBoundingBox": "normalized_bottom_left"
      ],
      "face": [
        "confidence": landmarks.faceConfidence,
        "boundingBoxNormalizedBottomLeft": landmarks.faceBoundingBox
      ],
      "contours": landmarks.contours,
      "lipBoundary": [
        "outerPoints": landmarks.outerPoints,
        "innerPoints": landmarks.innerPoints
      ],
      "privacy": [
        "localOnly": true,
        "offDeviceUpload": false,
        "rawFrameStoredByThisTool": false
      ],
      "warnings": [
        "native_vision_full_face_landmarks_current_frame",
        "buildless_sample_artifact_not_product_quality_proof"
      ]
    ]
  }

  private func makeMediaPipeFaceLandmarksArtifact(
    request: E7NativeBoundaryRequest,
    frameUrl: URL,
    exportUrl: URL,
    width: Int,
    height: Int,
    landmarks: E7MediaPipeFaceLandmarks
  ) -> [String: Any] {
    [
      "schemaVersion": "e7-native-face-landmarks-v0",
      "createdAt": isoNow(),
      "status": "available",
      "provider": "mediapipe",
      "captureSetId": request.captureSetId,
      "capturePairId": request.capturePairId,
      "captureShotKind": request.captureShotKind,
      "framePath": frameUrl.path,
      "arFaceExportPath": exportUrl.path,
      "frameWidth": width,
      "frameHeight": height,
      "coordinateSpaces": [
        "imagePoints": "frame_image_pixel_top_left",
        "landmarks": "frame_image_pixel_top_left"
      ],
      "landmarkCount": landmarks.landmarkPoints.count,
      "landmarks": landmarks.landmarkPoints,
      "namedRegions": landmarks.namedRegions,
      "lipBoundary": [
        "outerPoints": landmarks.outerPoints,
        "innerPoints": landmarks.innerPoints
      ],
      "privacy": [
        "localOnly": true,
        "offDeviceUpload": false,
        "rawFrameStoredByThisTool": false
      ],
      "warnings": [
        "native_mediapipe_full_face_landmarks_current_frame",
        "buildless_sample_artifact_not_product_quality_proof"
      ]
    ]
  }

  private func saveProviderArtifact(
    _ artifact: [String: Any],
    provider: String,
    frameUrl: URL
  ) throws -> URL {
    let target = frameUrl
      .deletingLastPathComponent()
      .appendingPathComponent("\(provider)_face_landmarks.json")
    try jsonData(artifact).write(to: target, options: .atomic)
    return target
  }

  private func cgImageOrientation(_ value: String) -> CGImagePropertyOrientation {
    switch value {
    case "upMirrored":
      return .upMirrored
    case "down":
      return .down
    case "downMirrored":
      return .downMirrored
    case "left":
      return .left
    case "leftMirrored":
      return .leftMirrored
    case "right":
      return .right
    case "rightMirrored":
      return .rightMirrored
    default:
      return .up
    }
  }

  private func jsonString(_ object: Any) throws -> String {
    String(data: try jsonData(object), encoding: .utf8) ?? "{}"
  }

  private func jsonData(_ object: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  }

  private func sanitizePathComponent(_ value: String) -> String {
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    let filtered = value.unicodeScalars.map { scalar in
      allowed.contains(scalar) ? String(scalar) : "-"
    }.joined()
    return filtered.trimmingCharacters(in: CharacterSet(charactersIn: ".-"))
  }

  private func isoNow() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
  }
}

private struct E7NativeBoundaryRequest {
  let provider: String
  let captureSetId: String
  let capturePairId: String
  let captureShotKind: String
  let framePath: String
  let arFaceExportPath: String
  let orientation: String
}

private struct E7VisionFaceLandmarks {
  let outerPoints: [[String: Double]]
  let innerPoints: [[String: Double]]
  let faceConfidence: Double
  let faceBoundingBox: [String: Double]
  let contours: [String: [String: Any]]
}

private struct E7MediaPipeFaceLandmarks {
  let outerPoints: [[String: Double]]
  let innerPoints: [[String: Double]]
  let landmarkPoints: [[String: Any]]
  let namedRegions: [String: [String: Any]]
}

private struct E7MediaPipeIndexedPixelPoint {
  let index: Int
  let x: Double
  let y: Double
  let z: Double
}

private struct E7BrowImageSampler {
  let bytesPerRow: Int
  let data: [UInt8]
  let height: Int
  let width: Int

  func luminance(x: Double, y: Double) -> Double {
    let pixelX = min(max(Int(x.rounded()), 0), width - 1)
    let pixelY = min(max(Int(y.rounded()), 0), height - 1)
    let offset = pixelY * bytesPerRow + pixelX * 4
    guard offset + 2 < data.count else {
      return 255.0
    }

    let red = Double(data[offset])
    let green = Double(data[offset + 1])
    let blue = Double(data[offset + 2])
    return red * 0.299 + green * 0.587 + blue * 0.114
  }
}

private let E7MediaPipeBrowBoundarySamplesPerSegment = 4

private let mediaPipeOuterLipIndices = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
  291, 409, 270, 269, 267, 0, 37, 39, 40, 185
]

private let mediaPipeInnerLipIndices = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324,
  308, 415, 310, 311, 312, 13, 82, 81, 80, 191
]

private let mediaPipeFaceOvalIndices = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
]

private let mediaPipeLeftEyeIndices = [
  263, 249, 390, 373, 374, 380, 381, 382,
  362, 398, 384, 385, 386, 387, 388, 466
]

private let mediaPipeLeftUpperEyelidIndices = [
  362, 398, 384, 385, 386, 387, 388, 466, 263
]

private let mediaPipeRightEyeIndices = [
  33, 7, 163, 144, 145, 153, 154, 155,
  133, 173, 157, 158, 159, 160, 161, 246
]

private let mediaPipeRightUpperEyelidIndices = [
  33, 246, 161, 160, 159, 158, 157, 173, 133
]

private let mediaPipeLeftBrowIndices = [
  276, 283, 282, 295, 285, 336, 296, 334, 293, 300
]

private let mediaPipeRightBrowIndices = [
  46, 53, 52, 65, 55, 107, 66, 105, 63, 70
]

private let mediaPipeLeftDenseBrowIndices = [
  299, 337, 284, 333, 298, 334, 296, 251, 336, 293, 301, 282,
  295, 283, 300, 389, 285, 276, 443, 442, 444, 257, 368, 445
]

private let mediaPipeRightDenseBrowIndices = [
  69, 108, 54, 104, 68, 105, 66, 21, 107, 63, 52, 71,
  65, 53, 70, 55, 223, 162, 46, 222, 224, 27, 139, 28, 225
]

private let mediaPipeLeftTempleIndices = [
  251, 389, 356, 454, 323, 361
]

private let mediaPipeRightTempleIndices = [
  109, 67, 103, 54, 21, 162
]

private let mediaPipeNoseBridgeIndices = [
  168, 6, 197, 195, 5, 4, 1
]

private enum E7NativeProviderError: LocalizedError {
  case invalidRequestJson
  case invalidPackageJson
  case missingField(String)
  case fileNotFound(String)
  case invalidFrameImage(String)
  case invalidArFaceExport(String)
  case documentsDirectoryUnavailable
  case visionLipLandmarksMissing
  case mediapipeModelMissing
  case mediapipeNoFaceDetected
  case mediapipeLandmarkCountTooSmall(Int, Int)

  var errorDescription: String? {
    switch self {
    case .invalidRequestJson:
      return "Invalid native boundary request JSON."
    case .invalidPackageJson:
      return "Invalid generated package JSON."
    case .missingField(let field):
      return "Missing required field: \(field)."
    case .fileNotFound(let path):
      return "Capture file not found: \(path)."
    case .invalidFrameImage(let path):
      return "Frame image could not be decoded: \(path)."
    case .invalidArFaceExport(let path):
      return "ARFace export JSON could not be decoded: \(path)."
    case .documentsDirectoryUnavailable:
      return "Documents directory is unavailable."
    case .visionLipLandmarksMissing:
      return "Vision did not return lip landmarks for the current frame."
    case .mediapipeModelMissing:
      return "MediaPipe face_landmarker.task is not bundled in the app resources."
    case .mediapipeNoFaceDetected:
      return "MediaPipe did not detect a face for the current frame."
    case .mediapipeLandmarkCountTooSmall(let count, let requiredIndex):
      return "MediaPipe returned \(count) landmarks; required index \(requiredIndex)."
    }
  }
}
