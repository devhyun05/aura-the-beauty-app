import AppKit
import Foundation

struct Point {
  let x: Double
  let y: Double
}

struct Sampler {
  let bytesPerRow: Int
  let data: [UInt8]
  let height: Int
  let width: Int

  func luminance(x: Double, y: Double) -> Double {
    let pixelX = min(max(Int(x.rounded()), 0), width - 1)
    let pixelY = min(max(Int(y.rounded()), 0), height - 1)
    let offset = pixelY * bytesPerRow + pixelX * 4
    guard offset + 2 < data.count else {
      return 255
    }
    let red = Double(data[offset])
    let green = Double(data[offset + 1])
    let blue = Double(data[offset + 2])
    return red * 0.299 + green * 0.587 + blue * 0.114
  }
}

func usage() -> Never {
  fputs(
    "usage: swift render_image_guided_brow_preview.swift <frame.png> <mediapipe_face_landmarks.json> <output.svg>\n",
    stderr
  )
  exit(2)
}

func asDict(_ value: Any?) -> [String: Any] {
  value as? [String: Any] ?? [:]
}

func asArray(_ value: Any?) -> [[String: Any]] {
  value as? [[String: Any]] ?? []
}

func regionPoints(_ regions: [String: Any], _ name: String) -> [Point] {
  asArray(asDict(regions[name])["imagePoints"]).compactMap { item in
    guard let x = item["x"] as? Double, let y = item["y"] as? Double else {
      return nil
    }
    return Point(x: x, y: y)
  }
}

func bounds(_ points: [Point]) -> (minX: Double, minY: Double, maxX: Double, maxY: Double)? {
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

func percentile(_ values: [Double], _ ratio: Double) -> Double {
  guard !values.isEmpty else {
    return 168
  }
  let sorted = values.sorted()
  let index = Int(max(0, min(Double(sorted.count - 1), Double(sorted.count - 1) * ratio)).rounded())
  return sorted[index]
}

func interpolateY(_ points: [Point], x: Double) -> Double {
  let sorted = points.sorted { first, second in
    first.x == second.x ? first.y < second.y : first.x < second.x
  }
  guard let first = sorted.first else {
    return 0
  }
  if x <= first.x {
    return first.y
  }
  guard let last = sorted.last else {
    return first.y
  }
  if x >= last.x {
    return last.y
  }
  for index in 1..<sorted.count {
    let previous = sorted[index - 1]
    let current = sorted[index]
    if x <= current.x {
      let delta = current.x - previous.x
      let t = max(0, min(1, (x - previous.x) / (delta == 0 ? 1 : delta)))
      return previous.y + (current.y - previous.y) * t
    }
  }
  return last.y
}

func polygonString(_ points: [Point]) -> String {
  points.map { String(format: "%.1f,%.1f", $0.x, $0.y) }.joined(separator: " ")
}

func pointDictionaries(_ points: [Point]) -> [[String: Double]] {
  points.map { point in
    [
      "x": point.x,
      "y": point.y,
      "z": 0.0
    ]
  }
}

func clamp(_ value: Double, _ lower: Double, _ upper: Double) -> Double {
  max(lower, min(upper, value))
}

func clamp01(_ value: Double) -> Double {
  clamp(value.isFinite ? value : 0, 0, 1)
}

func lerp(_ start: Double, _ end: Double, _ amount: Double) -> Double {
  start + (end - start) * amount
}

func smoothstep(_ edge0: Double, _ edge1: Double, _ value: Double) -> Double {
  let t = clamp01((value - edge0) / (edge1 - edge0 == 0 ? 1 : edge1 - edge0))
  return t * t * (3 - 2 * t)
}

func circles(_ points: [Point], color: String, radius: Double) -> String {
  points.map {
    String(
      format:
        "<circle cx=\"%.1f\" cy=\"%.1f\" r=\"%.1f\" fill=\"%@\" stroke=\"#111\" stroke-width=\"1\"/>",
      $0.x,
      $0.y,
      radius,
      color
    )
  }.joined()
}

func makeSampler(_ image: NSImage) -> Sampler? {
  var proposed = CGRect(origin: .zero, size: image.size)
  guard let cgImage = image.cgImage(forProposedRect: &proposed, context: nil, hints: nil) else {
    return nil
  }
  let width = cgImage.width
  let height = cgImage.height
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
  return Sampler(bytesPerRow: bytesPerRow, data: data, height: height, width: width)
}

func appearance(
  side: String,
  regions: [String: Any],
  sampler: Sampler,
  frameWidth: Double,
  frameHeight: Double
) -> (polygon: [Point], centers: [Point], core: [Point], roi: (Double, Double, Double, Double)) {
  let brow = regionPoints(regions, "\(side)Eyebrow")
  let eye = regionPoints(regions, "\(side)Eye")
  let lid = regionPoints(regions, "\(side)UpperEyelid")
  guard
    let browBounds = bounds(brow),
    let eyeBounds = bounds(eye),
    let lidBounds = bounds(lid)
  else {
    return (brow, [], brow, (0, 0, 0, 0))
  }
  let browHeight = max(1, browBounds.maxY - browBounds.minY)
  let eyeHeight = max(1, eyeBounds.maxY - eyeBounds.minY)
  let roiMinX = max(0, browBounds.minX)
  let roiMaxX = min(frameWidth - 1, browBounds.maxX)
  let roiMinY = max(0, browBounds.minY - max(browHeight * 0.46, eyeHeight * 0.18))
  let roiMaxY = min(
    frameHeight - 1,
    min(
      browBounds.maxY + max(browHeight * 0.26, eyeHeight * 0.10),
      min(eyeBounds.minY, lidBounds.minY) - eyeHeight * 0.16
    )
  )
  let scaleX = Double(sampler.width) / frameWidth
  let scaleY = Double(sampler.height) / frameHeight
  func luma(_ x: Double, _ y: Double) -> Double {
    sampler.luminance(x: x * scaleX, y: y * scaleY)
  }
  var lumas: [Double] = []
  let xStep = max(1, Int((roiMaxX - roiMinX) / 36))
  let yStep = max(1, Int((roiMaxY - roiMinY) / 18))
  var sx = Int(roiMinX.rounded())
  while sx <= Int(roiMaxX.rounded()) {
    var sy = Int(roiMinY.rounded())
    while sy <= Int(roiMaxY.rounded()) {
      lumas.append(luma(Double(sx), Double(sy)))
      sy += yStep
    }
    sx += xStep
  }
  let skinBaseline = percentile(lumas, 0.72)
  let columnCount = 18
  var upper: [Point] = []
  var lower: [Point] = []
  var centers: [Point] = []
  for index in 0..<columnCount {
    let t = Double(index) / Double(columnCount - 1)
    let x = roiMinX + (roiMaxX - roiMinX) * t
    let predictedY = interpolateY(brow, x: x)
    var bestY = predictedY
    var bestLuma = luma(x, predictedY)
    var bestScore = -Double.greatestFiniteMagnitude
    let scanMinY = max(
      roiMinY,
      predictedY - max(browHeight * 0.62, eyeHeight * 0.10)
    )
    let scanMaxY = min(
      roiMaxY,
      predictedY + max(browHeight * 0.48, eyeHeight * 0.10)
    )
    var y = Int(scanMinY.rounded())
    while y <= Int(scanMaxY.rounded()) {
      let currentY = Double(y)
      let currentLuma = luma(x, currentY)
      let verticalContrast = max(
        abs(currentLuma - luma(x, currentY - 2)),
        abs(currentLuma - luma(x, currentY + 2))
      )
      let distancePenalty = abs(currentY - predictedY) / max(1, roiMaxY - roiMinY) * 0.38
      let darknessScore = max(0, skinBaseline - currentLuma) / 255
      let score = darknessScore + verticalContrast / 255 * 0.24 - distancePenalty
      if score > bestScore {
        bestScore = score
        bestY = currentY
        bestLuma = currentLuma
      }
      y += 1
    }
    if bestScore < 0.02 {
      bestY = predictedY
      bestLuma = luma(x, predictedY)
    }

    let contrast = max(0, skinBaseline - bestLuma) / 255
    let thickness = min(
      max(4, browHeight * (0.24 + contrast * 0.82)),
      max(5, (roiMaxY - roiMinY) * 0.36)
    )
    upper.append(Point(x: x, y: max(roiMinY, bestY - thickness * 0.48)))
    lower.append(Point(x: x, y: min(roiMaxY, bestY + thickness * 0.52)))
    centers.append(Point(x: x, y: bestY))
  }
  return (upper + lower.reversed(), centers, brow, (roiMinX, roiMinY, roiMaxX, roiMaxY))
}

struct PointWithT {
  let t: Double
  let x: Double
  let y: Double
}

func interpolateChainY(_ chain: [PointWithT], t: Double) -> Double {
  guard let first = chain.first else {
    return 0
  }
  if t <= first.t {
    return first.y
  }
  guard let last = chain.last else {
    return first.y
  }
  if t >= last.t {
    return last.y
  }

  for index in 1..<chain.count {
    let previous = chain[index - 1]
    let current = chain[index]
    if t <= current.t {
      let localT = clamp01((t - previous.t) / (current.t - previous.t == 0 ? 1 : current.t - previous.t))
      return lerp(previous.y, current.y, smoothstep(0, 1, localT))
    }
  }

  return last.y
}

func smoothChainY(_ chain: [PointWithT], t: Double) -> Double {
  if chain.count <= 2 {
    return interpolateChainY(chain, t: t)
  }

  let bandwidth = 0.16
  var weightedY = 0.0
  var weightSum = 0.0
  for point in chain {
    let distance = t - point.t
    let weight = exp(-(distance * distance) / (2 * bandwidth * bandwidth))
    weightedY += point.y * weight
    weightSum += weight
  }

  let smoothedY = weightSum > 0 ? weightedY / weightSum : interpolateChainY(chain, t: t)
  let interpolatedY = interpolateChainY(chain, t: t)
  return lerp(interpolatedY, smoothedY, 0.72)
}

func shapeCorrectedBrowPolygon(
  appearancePoints: [Point],
  roi: (Double, Double, Double, Double),
  side: String,
  frameWidth: Double,
  frameHeight: Double
) -> [Point] {
  guard appearancePoints.count >= 6 else {
    return appearancePoints
  }

  let direction = side == "left" ? 1.0 : -1.0
  let innerX = direction > 0 ? roi.0 : roi.2
  let outerX = direction > 0 ? roi.2 : roi.0
  let topY = roi.1
  let bottomY = roi.3
  let width = max(1, abs(outerX - innerX))
  let height = max(1, bottomY - topY)
  var pointsWithT: [PointWithT] = []
  for point in appearancePoints {
    pointsWithT.append(
      PointWithT(
        t: clamp01(((point.x - innerX) * direction) / width),
        x: point.x,
        y: point.y
      )
    )
  }
  pointsWithT.sort { first, second in
    first.t == second.t ? first.y < second.y : first.t < second.t
  }
  let sortedY = pointsWithT.sorted { $0.y < $1.y }
  let splitIndex = min(sortedY.count - 1, max(0, Int(Double(sortedY.count) * 0.52)))
  let splitY = sortedY[splitIndex].y
  var upperChain: [PointWithT] = []
  var lowerChain: [PointWithT] = []
  for point in pointsWithT {
    if point.y <= splitY {
      upperChain.append(point)
    } else {
      lowerChain.append(point)
    }
  }
  upperChain.sort { first, second in
    first.t == second.t ? first.y < second.y : first.t < second.t
  }
  lowerChain.sort { first, second in
    first.t == second.t ? first.y > second.y : first.t < second.t
  }

  func personalSample(_ t: Double) -> (upperY: Double, lowerY: Double)? {
    guard upperChain.count >= 2, lowerChain.count >= 2 else {
      return nil
    }
    let upperY = smoothChainY(upperChain, t: t)
    let lowerY = smoothChainY(lowerChain, t: t)
    let minThickness = height * 0.12
    let maxThickness = height * 0.56
    let adjustedLowerY = clamp(
      max(lowerY, upperY + minThickness),
      upperY + minThickness,
      upperY + maxThickness
    )
    return (upperY, adjustedLowerY)
  }

  var upperCurve: [Point] = []
  var lowerCurve: [Point] = []
  let sampleCount = 18
  for index in 0..<sampleCount {
    let t = Double(index) / Double(sampleCount - 1)
    let x = lerp(innerX, outerX, t)
    let arch = sin(Double.pi * t)
    let tail = smoothstep(0.58, 1, t)
    let innerSoftDrop = (1 - smoothstep(0, 0.18, t)) * 0.035
    let centerY = topY + height * (0.54 - arch * 0.15 + tail * 0.09 + innerSoftDrop)
    let thickness = height * 0.26 * (1 - tail * 0.48) * (0.88 + 0.12 * sin(Double.pi * t))
    let templateUpperY = centerY - thickness * 0.56
    let templateLowerY = centerY + thickness * 0.44
    if let personal = personalSample(t) {
      upperCurve.append(Point(x: x, y: lerp(templateUpperY, personal.upperY, 0.86)))
      lowerCurve.append(Point(x: x - direction * thickness * 0.06 * tail, y: lerp(templateLowerY, personal.lowerY, 0.82)))
    } else {
      upperCurve.append(Point(x: x, y: templateUpperY))
      lowerCurve.append(Point(x: x - direction * thickness * 0.06 * tail, y: templateLowerY))
    }
  }

  guard let tailUpper = upperCurve.last, let tailLower = lowerCurve.last else {
    return appearancePoints
  }
  let tailPoint = Point(
    x: outerX + direction * height * 0.02,
    y: (tailUpper.y + tailLower.y) * 0.5 + height * 0.018
  )
  return (upperCurve.dropLast() + [tailPoint] + lowerCurve.dropLast().reversed()).map { point in
    Point(
      x: clamp(point.x, 0, frameWidth - 1),
      y: clamp(point.y, 0, frameHeight - 1)
    )
  }
}

func strandLines(_ centers: [Point], side: String) -> String {
  let direction = side == "left" ? 1.0 : -1.0
  return centers.enumerated().map { index, point in
    let length = 4.0 + Double(index % 3)
    return String(
      format:
        "<line x1=\"%.1f\" y1=\"%.1f\" x2=\"%.1f\" y2=\"%.1f\" stroke=\"#1B120E\" stroke-opacity=\"0.34\" stroke-width=\"0.8\" stroke-linecap=\"round\"/>",
      point.x - direction * length * 0.35,
      point.y + 2.0,
      point.x + direction * length * 0.65,
      point.y - 2.0
    )
  }.joined()
}

let args = CommandLine.arguments
guard args.count == 4 else {
  usage()
}
let framePath = args[1]
let landmarksPath = args[2]
let outputPath = args[3]
guard let image = NSImage(contentsOfFile: framePath), let sampler = makeSampler(image) else {
  fatalError("failed to read frame image")
}
let landmarksData = try Data(contentsOf: URL(fileURLWithPath: landmarksPath))
let root = try JSONSerialization.jsonObject(with: landmarksData) as? [String: Any] ?? [:]
let regions = asDict(root["namedRegions"])
let frameWidth = root["frameWidth"] as? Double ?? Double(sampler.width)
let frameHeight = root["frameHeight"] as? Double ?? Double(sampler.height)
let frameBase64 = try Data(contentsOf: URL(fileURLWithPath: framePath)).base64EncodedString()
let left = appearance(
  side: "left",
  regions: regions,
  sampler: sampler,
  frameWidth: frameWidth,
  frameHeight: frameHeight
)
let right = appearance(
  side: "right",
  regions: regions,
  sampler: sampler,
  frameWidth: frameWidth,
  frameHeight: frameHeight
)
if outputPath.hasSuffix(".json") {
  let payload: [String: Any] = [
    "leftEyebrowAppearance": [
      "status": "available",
      "generationMethod": "image_guided_brow_appearance_roi_v1_debug_parity",
      "pointCount": left.polygon.count,
      "sampleColumnCount": left.centers.count,
      "roi": [
        "minX": left.roi.0,
        "minY": left.roi.1,
        "maxX": left.roi.2,
        "maxY": left.roi.3
      ],
      "imagePoints": pointDictionaries(left.polygon)
    ],
    "rightEyebrowAppearance": [
      "status": "available",
      "generationMethod": "image_guided_brow_appearance_roi_v1_debug_parity",
      "pointCount": right.polygon.count,
      "sampleColumnCount": right.centers.count,
      "roi": [
        "minX": right.roi.0,
        "minY": right.roi.1,
        "maxX": right.roi.2,
        "maxY": right.roi.3
      ],
      "imagePoints": pointDictionaries(right.polygon)
    ]
  ]
  let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
  try data.write(to: URL(fileURLWithPath: outputPath))
  print(outputPath)
  exit(0)
}
let leftFinal = shapeCorrectedBrowPolygon(
  appearancePoints: left.polygon,
  roi: left.roi,
  side: "left",
  frameWidth: frameWidth,
  frameHeight: frameHeight
)
let rightFinal = shapeCorrectedBrowPolygon(
  appearancePoints: right.polygon,
  roi: right.roi,
  side: "right",
  frameWidth: frameWidth,
  frameHeight: frameHeight
)
let style = """
<style>.title{font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;fill:#FFD400;paint-order:stroke;stroke:#000;stroke-width:4px}.sub{font-family:-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:3px}</style>
"""
func roiRect(_ roi: (Double, Double, Double, Double)) -> String {
  String(
    format:
      "<rect x=\"%.1f\" y=\"%.1f\" width=\"%.1f\" height=\"%.1f\" fill=\"#FFD400\" fill-opacity=\".04\" stroke=\"#FFD400\" stroke-width=\"1\" stroke-dasharray=\"5 6\"/>",
    roi.0,
    roi.1,
    roi.2 - roi.0,
    roi.3 - roi.1
  )
}
let svg = """
<svg xmlns="http://www.w3.org/2000/svg" width="\(Int(frameWidth))" height="\(Int(frameHeight))" viewBox="0 0 \(Int(frameWidth)) \(Int(frameHeight))">
\(style)
<image href="data:image/png;base64,\(frameBase64)" x="0" y="0" width="\(Int(frameWidth))" height="\(Int(frameHeight))"/>
\(roiRect(left.roi))
\(roiRect(right.roi))
<polygon points="\(polygonString(leftFinal))" fill="#4A342B" fill-opacity="0.30" stroke="#FFD400" stroke-width="1.05" stroke-linejoin="round"/>
<polygon points="\(polygonString(rightFinal))" fill="#4A342B" fill-opacity="0.30" stroke="#FFD400" stroke-width="1.05" stroke-linejoin="round"/>
\(strandLines(left.centers, side: "left"))
\(strandLines(right.centers, side: "right"))
<text class="title" x="24" y="42">Final brow mask preview - Brown</text>
<text class="sub" x="24" y="68">yellow=thin final mask boundary, brown=expected fill, dashed=ROI</text>
</svg>
"""
try svg.write(toFile: outputPath, atomically: true, encoding: .utf8)
print(outputPath)
