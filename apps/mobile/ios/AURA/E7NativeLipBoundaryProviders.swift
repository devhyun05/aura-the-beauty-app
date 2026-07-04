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
  #if canImport(MediaPipeTasksVision)
  private let mediaPipeFaceLandmarkerLock = NSLock()
  private var cachedMediaPipeFaceLandmarker: FaceLandmarker?
  #endif

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
        "leftEye": landmarkRegionPayload(
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
  private func makeMediaPipeFaceLandmarker() throws -> FaceLandmarker {
    guard let modelPath = Bundle.main.path(
      forResource: "face_landmarker",
      ofType: "task"
    ) else {
      throw E7NativeProviderError.mediapipeModelMissing
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

    return try FaceLandmarker(options: options)
  }

  private func getCachedMediaPipeFaceLandmarker() throws -> FaceLandmarker {
    if let cachedMediaPipeFaceLandmarker {
      return cachedMediaPipeFaceLandmarker
    }

    let landmarker = try makeMediaPipeFaceLandmarker()
    cachedMediaPipeFaceLandmarker = landmarker
    return landmarker
  }

  private func detectMediaPipeFaceLandmarks(_ image: MPImage) throws -> FaceLandmarkerResult {
    mediaPipeFaceLandmarkerLock.lock()
    defer {
      mediaPipeFaceLandmarkerLock.unlock()
    }

    let landmarker = try getCachedMediaPipeFaceLandmarker()
    return try landmarker.detect(image: image)
  }

  private func extractMediaPipeFaceLandmarks(
    frameUrl: URL,
    width: Int,
    height: Int
  ) throws -> E7MediaPipeFaceLandmarks {
    guard let uiImage = UIImage(contentsOfFile: frameUrl.path) else {
      throw E7NativeProviderError.invalidFrameImage(frameUrl.path)
    }

    let image = try MPImage(uiImage: uiImage)
    let result = try detectMediaPipeFaceLandmarks(image)
    guard let faceLandmarks = result.faceLandmarks.first else {
      throw E7NativeProviderError.mediapipeNoFaceDetected
    }

    let requiredIndex = max(
      mediaPipeOuterLipIndices.max() ?? 0,
      mediaPipeInnerLipIndices.max() ?? 0
    )
    if faceLandmarks.count <= requiredIndex {
      throw E7NativeProviderError.mediapipeLandmarkCountTooSmall(
        faceLandmarks.count,
        requiredIndex
      )
    }

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
        "rightEye": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeRightEyeIndices,
          width: width,
          height: height
        ),
        "leftEyebrow": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeLeftBrowIndices,
          width: width,
          height: height
        ),
        "rightEyebrow": mediaPipeRegionPayload(
          faceLandmarks,
          indices: mediaPipeRightBrowIndices,
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

private let mediaPipeRightEyeIndices = [
  33, 7, 163, 144, 145, 153, 154, 155,
  133, 173, 157, 158, 159, 160, 161, 246
]

private let mediaPipeLeftBrowIndices = [
  276, 283, 282, 295, 285, 336, 296, 334, 293, 300
]

private let mediaPipeRightBrowIndices = [
  46, 53, 52, 65, 55, 107, 66, 105, 63, 70
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
