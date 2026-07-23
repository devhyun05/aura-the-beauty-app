import {
  parseGoldenMaskCaptureArtifact,
  parseGoldenMaskReportDescriptor,
} from './goldenMask';

function expect(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(label);
  }
}

const fingerprint = 'a'.repeat(64);
const capture = parseGoldenMaskCaptureArtifact({
  byteSize: 38_400,
  captureId: 'capture-1',
  createdAtUnixMs: 1_753_238_400_000,
  schemaVersion: 'aura.golden-mask.v1',
  topologyFingerprint: fingerprint,
  triangleIndexCount: 6_912,
  trueDepthHardware: true,
  uri: 'file:///tmp/capture-1.auragm',
  uvCount: 1_220,
  vertexCount: 1_220,
});
expect(capture?.triangleIndexCount === 6_912, 'valid capture artifact parses');
expect(
  parseGoldenMaskCaptureArtifact({...capture, trueDepthHardware: false}) === null,
  'v1 artifact requires TrueDepth provenance',
);
expect(
  parseGoldenMaskCaptureArtifact({...capture, triangleIndexCount: 6_911}) === null,
  'triangle indices must contain complete triangles',
);
expect(
  parseGoldenMaskCaptureArtifact({...capture, topologyFingerprint: 'short'}) === null,
  'topology fingerprint must be a sha256 digest',
);
expect(
  parseGoldenMaskCaptureArtifact({...capture, vertexCount: 4_097, uvCount: 4_097}) ===
    null,
  'v1 vertex count is bounded to the ARKit face topology envelope',
);
expect(
  parseGoldenMaskCaptureArtifact({...capture, captureId: 'x'.repeat(201)}) ===
    null,
  'capture id is bounded',
);
expect(
  parseGoldenMaskCaptureArtifact({...capture, byteSize: 1_048_576}) !== null,
  'one MiB artifact is accepted',
);
expect(
  parseGoldenMaskCaptureArtifact({...capture, byteSize: 1_048_577}) === null,
  'artifact larger than one MiB is rejected',
);

const report = parseGoldenMaskReportDescriptor({
  available: true,
  byteSize: 38_400,
  captureId: 'capture-1',
  contentType: 'application/vnd.aura.golden-mask',
  createdAt: '2025-07-23T00:00:00.000Z',
  indexCount: 6_912,
  mediaId: 'media-1',
  schemaVersion: 'aura.golden-mask.v1',
  source: 'arkit_face_mesh',
  topologyFingerprint: fingerprint,
  trueDepthHardware: true,
  uvCount: 1_220,
  vertexCount: 1_220,
});
expect(report?.mediaId === 'media-1', 'stored report descriptor parses');
expect(
  parseGoldenMaskReportDescriptor({
    ...report,
    downloadUrl: 'https://example.test/private-mask',
    expiresInSeconds: 900,
  })?.downloadUrl === 'https://example.test/private-mask',
  'dedicated download descriptor parses',
);
expect(
  parseGoldenMaskReportDescriptor({...report, available: false}) === null,
  'unavailable report descriptor is omitted',
);
expect(
  parseGoldenMaskReportDescriptor({...report, uvCount: undefined}) === null,
  'stored report must preserve UV provenance',
);
expect(
  parseGoldenMaskReportDescriptor({
    ...report,
    trueDepthHardware: undefined,
  }) === null,
  'stored report must preserve TrueDepth provenance',
);

console.log('goldenMask contract passed');
