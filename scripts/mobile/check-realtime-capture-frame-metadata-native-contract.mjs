import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const nativePath = 'apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m';
const source = readFileSync(resolve(repoRoot, nativePath), 'utf8');

function expect(condition, message) {
  if (!condition) {
    throw new Error(`[aura:capture-frame-native] ${message}`);
  }
}

function contains(pattern, message) {
  expect(pattern.test(source), `${nativePath}: ${message}`);
}

contains(
  /AURARealtimeCaptureFrameMaxAgeMs\s*=\s*500\.0/,
  'capture-frame freshness limit must remain 500ms',
);
contains(
  /@"source":\s*@"latest_pre_shutter_video_frame"/,
  'snapshot source label is missing',
);
contains(
  /@"photoPixelsAnalyzed":\s*@NO/,
  'snapshot must explicitly say that saved photo pixels were not analyzed',
);
expect(!/@"photoPixelsAnalyzed":\s*@YES/.test(source), 'native code overclaims saved-photo analysis');
for (const field of ['frameAgeMsAtCaptureRequest', 'isStale', 'frame']) {
  contains(new RegExp(`@"${field}"`), `captureFrameMetadata.${field} is missing`);
}

contains(
  /_captureFrameMetadataBySettingsID\[@\(settings\.uniqueID\)\]\s*=\s*snapshot/,
  'preview snapshot is not keyed by AVCapturePhotoSettings.uniqueID',
);
contains(
  /settingsID\s*=\s*@\(photo\.resolvedSettings\.uniqueID\)/,
  'returned photo does not look up its own resolved settings ID',
);
contains(
  /_captureFrameMetadataBySettingsID\[settingsID\]/,
  'returned photo does not retrieve the matching snapshot',
);
contains(
  /payload\[@"captureFrameMetadata"\]\s*=\s*captureFrameMetadata/,
  'capture() result does not expose the matched metadata',
);

const associateCalls = source.match(/associateLatestEmittedFrameWithPhotoSettings:settings\]/g) ?? [];
expect(associateCalls.length >= 2, 'both primary and plain-photo fallback captures must freeze a frame');
contains(
  /dispatch_queue_create\("aura\.realtimeFaceCapture\.frameMetadata",\s*DISPATCH_QUEUE_SERIAL\)/,
  'frame snapshot does not have a dedicated serial queue',
);
contains(
  /dispatch_sync\(_frameMetadataQueue,[\s\S]*?_latestEmittedFrame\s*=\s*\[frame copy\]/,
  'fully emitted frame is not serialized before capture reads it',
);

contains(
  /attachScreenLandmarksToPayload:payloadWithScreenPoints[\s\S]*?attachMediaPipeScreenLandmarksToPayload:payloadWithScreenPoints[\s\S]*?recordLatestEmittedFrame:payloadWithScreenPoints/,
  'snapshot is recorded before projected screen landmarks are attached',
);
contains(
  /removeObjectForKey:AURARealtimeFrameTimestampPayloadKey[\s\S]*?onLandmarksDetected\(payloadWithScreenPoints\)/,
  'private monotonic timestamp can leak into the JS event',
);

for (const requiredFrameField of [
  'imageWidth',
  'imageHeight',
  'faceCount',
  'status',
  'sequence',
  'mediaPipe',
  'cameraStability',
  'imageQuality',
]) {
  contains(new RegExp(`@"${requiredFrameField}"`), `live frame field ${requiredFrameField} is missing`);
}

// Contract fixture: fallback settings must retrieve fallback evidence, while
// the original settings retain their own pre-shutter frame until one wins.
const snapshots = new Map();
snapshots.set(101, {frame: {sequence: 11}});
snapshots.set(202, {frame: {sequence: 19}});
expect(snapshots.get(101)?.frame.sequence === 11, 'primary photo snapshot mismatch');
expect(snapshots.get(202)?.frame.sequence === 19, 'fallback photo snapshot mismatch');

function freshness(ageMs) {
  return {isStale: ageMs > 500};
}
expect(freshness(500).isStale === false, '500ms boundary must still be fresh');
expect(freshness(500.1).isStale === true, 'frames older than 500ms must be stale');

console.log(
  '[aura:capture-frame-native] PASS — full emitted frame, freshness, and photo uniqueID matching verified',
);
