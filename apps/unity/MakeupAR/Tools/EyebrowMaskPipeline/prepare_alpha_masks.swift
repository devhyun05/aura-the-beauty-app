import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

private struct RGBAImage {
    let width: Int
    let height: Int
    var bytes: [UInt8]

    init?(url: URL) {
        guard
            let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else {
            return nil
        }

        width = image.width
        height = image.height
        bytes = [UInt8](repeating: 0, count: width * height * 4)
        guard
            let context = CGContext(
                data: &bytes,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        else {
            return nil
        }

        context.interpolationQuality = .none
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    }

    func luma(x: Int, y: Int) -> Double {
        let index = (y * width + x) * 4
        let red = Double(bytes[index])
        let green = Double(bytes[index + 1])
        let blue = Double(bytes[index + 2])
        return red * 0.299 + green * 0.587 + blue * 0.114
    }
}

private struct Bounds {
    var minX: Int
    var minY: Int
    var maxX: Int
    var maxY: Int

    var width: Int { maxX - minX + 1 }
    var height: Int { maxY - minY + 1 }
}

private let outputWidth = 512
private let outputHeight = 160
private let backgroundCutoff = 238.0
private let darknessSpan = 125.0
private let alphaGamma = 0.78
private let horizontalInset = 10
private let verticalInset = 8

private func strandAlpha(luma: Double) -> Double {
    let linear = min(1.0, max(0.0, (backgroundCutoff - luma) / darknessSpan))
    return pow(linear, alphaGamma)
}

private func findLeftBrowBounds(_ image: RGBAImage) -> Bounds? {
    var result: Bounds?
    let searchMaxX = image.width / 2

    for y in 0..<image.height {
        for x in 0..<searchMaxX {
            guard strandAlpha(luma: image.luma(x: x, y: y)) >= 0.08 else {
                continue
            }

            if result == nil {
                result = Bounds(minX: x, minY: y, maxX: x, maxY: y)
            } else {
                result!.minX = min(result!.minX, x)
                result!.minY = min(result!.minY, y)
                result!.maxX = max(result!.maxX, x)
                result!.maxY = max(result!.maxY, y)
            }
        }
    }

    guard var bounds = result else {
        return nil
    }

    let padX = max(6, Int(Double(bounds.width) * 0.04))
    let padY = max(6, Int(Double(bounds.height) * 0.16))
    bounds.minX = max(0, bounds.minX - padX)
    bounds.maxX = min(searchMaxX - 1, bounds.maxX + padX)
    bounds.minY = max(0, bounds.minY - padY)
    bounds.maxY = min(image.height - 1, bounds.maxY + padY)
    return bounds
}

private func bilinearAlpha(_ image: RGBAImage, bounds: Bounds, u: Double, v: Double) -> Double {
    let sourceX = Double(bounds.minX) + u * Double(max(1, bounds.width - 1))
    let sourceY = Double(bounds.minY) + v * Double(max(1, bounds.height - 1))
    let x0 = min(image.width - 1, max(0, Int(floor(sourceX))))
    let y0 = min(image.height - 1, max(0, Int(floor(sourceY))))
    let x1 = min(image.width - 1, x0 + 1)
    let y1 = min(image.height - 1, y0 + 1)
    let tx = sourceX - Double(x0)
    let ty = sourceY - Double(y0)

    let a00 = strandAlpha(luma: image.luma(x: x0, y: y0))
    let a10 = strandAlpha(luma: image.luma(x: x1, y: y0))
    let a01 = strandAlpha(luma: image.luma(x: x0, y: y1))
    let a11 = strandAlpha(luma: image.luma(x: x1, y: y1))
    let top = a00 + (a10 - a00) * tx
    let bottom = a01 + (a11 - a01) * tx
    return top + (bottom - top) * ty
}

private struct MaskJob {
    let sourceURL: URL
    let outputURL: URL
    let source: RGBAImage
    let bounds: Bounds
}

private func writeMask(job: MaskJob, canonicalScale: Double) throws {
    let source = job.source
    let bounds = job.bounds
    var output = [UInt8](repeating: 0, count: outputWidth * outputHeight * 4)
    let contentWidth = outputWidth - horizontalInset * 2
    let contentHeight = outputHeight - verticalInset * 2
    let renderedWidth = min(
        contentWidth,
        max(1, Int((Double(bounds.width) * canonicalScale).rounded()))
    )
    let renderedHeight = min(
        contentHeight,
        max(1, Int((Double(bounds.height) * canonicalScale).rounded()))
    )
    let outputStartX = (outputWidth - renderedWidth) / 2
    let outputStartY = (outputHeight - renderedHeight) / 2

    // Use one canonical x/y scale for every supplied asset. The old independent
    // 512x160 stretch normalized every tight bbox to the same height, turning a
    // shallow straight eyebrow into the same exaggerated arch as the curved ones.
    for y in 0..<renderedHeight {
        let v = Double(y) / Double(max(1, renderedHeight - 1))
        for x in 0..<renderedWidth {
            let u = Double(x) / Double(max(1, renderedWidth - 1))
            let alpha = bilinearAlpha(source, bounds: bounds, u: u, v: v)
            let outputX = x + outputStartX
            let outputY = y + outputStartY
            let index = (outputY * outputWidth + outputX) * 4
            let alphaByte = UInt8((min(1.0, max(0.0, alpha)) * 255.0).rounded())
            // Premultiplied white keeps the PNG easy to inspect while the Unity shader still
            // uses only the alpha channel for the selected eyebrow colour.
            output[index] = alphaByte
            output[index + 1] = alphaByte
            output[index + 2] = alphaByte
            output[index + 3] = alphaByte
        }
    }

    guard
        let provider = CGDataProvider(data: Data(output) as CFData),
        let cgImage = CGImage(
            width: outputWidth,
            height: outputHeight,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: outputWidth * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
        )
    else {
        throw NSError(domain: "EyebrowMaskPipeline", code: 3, userInfo: [
            NSLocalizedDescriptionKey: "Unable to create the output bitmap",
        ])
    }

    try FileManager.default.createDirectory(
        at: job.outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    guard
        let destination = CGImageDestinationCreateWithURL(
            job.outputURL as CFURL,
            UTType.png.identifier as CFString,
            1,
            nil
        )
    else {
        throw NSError(domain: "EyebrowMaskPipeline", code: 4, userInfo: [
            NSLocalizedDescriptionKey: "Unable to create \(job.outputURL.path)",
        ])
    }

    CGImageDestinationAddImage(destination, cgImage, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "EyebrowMaskPipeline", code: 5, userInfo: [
            NSLocalizedDescriptionKey: "Unable to finalize \(job.outputURL.path)",
        ])
    }

    print(
        "\(job.sourceURL.lastPathComponent) -> \(job.outputURL.lastPathComponent) "
        + "sourceBrow=\(bounds.width)x\(bounds.height) "
        + "rendered=\(renderedWidth)x\(renderedHeight) output=\(outputWidth)x\(outputHeight)"
    )
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard !arguments.isEmpty, arguments.count.isMultiple(of: 2) else {
    fputs("Usage: prepare_alpha_masks <input.png> <output.png> [<input.png> <output.png> ...]\n", stderr)
    exit(64)
}

do {
    var jobs: [MaskJob] = []
    for index in stride(from: 0, to: arguments.count, by: 2) {
        let sourceURL = URL(fileURLWithPath: arguments[index])
        guard let source = RGBAImage(url: sourceURL) else {
            throw NSError(domain: "EyebrowMaskPipeline", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Unable to decode \(sourceURL.path)",
            ])
        }
        guard let bounds = findLeftBrowBounds(source) else {
            throw NSError(domain: "EyebrowMaskPipeline", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Unable to locate a left eyebrow in \(sourceURL.path)",
            ])
        }
        jobs.append(MaskJob(
            sourceURL: sourceURL,
            outputURL: URL(fileURLWithPath: arguments[index + 1]),
            source: source,
            bounds: bounds
        ))
    }

    let maxBoundsWidth = jobs.map(\.bounds.width).max() ?? 1
    let maxBoundsHeight = jobs.map(\.bounds.height).max() ?? 1
    let canonicalScale = min(
        Double(outputWidth - horizontalInset * 2) / Double(maxBoundsWidth),
        Double(outputHeight - verticalInset * 2) / Double(maxBoundsHeight)
    )
    for job in jobs {
        try writeMask(
            job: job,
            canonicalScale: canonicalScale
        )
    }
} catch {
    fputs("\(error.localizedDescription)\n", stderr)
    exit(1)
}
