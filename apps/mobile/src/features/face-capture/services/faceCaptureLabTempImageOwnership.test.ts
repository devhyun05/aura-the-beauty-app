import {FaceCaptureLabTempImageOwnership} from './faceCaptureLabTempImageOwnership';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const deleted: string[] = [];
  const ownership = new FaceCaptureLabTempImageOwnership(async uri => {
    if (!uri) {
      return false;
    }
    deleted.push(uri);
    return true;
  });
  const shot1 = 'file:///cache/aura_unified_face_1_1.jpg';
  const shot2 = 'file:///cache/aura_unified_face_2_2.jpg';
  const finalShot = 'file:///cache/aura_unified_face_3_3.jpg';

  ownership.take(shot1);
  ownership.take(shot2);
  expect(ownership.pendingCount === 2, 'two committed shots must be owned');
  expect(
    await ownership.release(shot1),
    'next/retake must delete the released committed shot',
  );
  expect(
    ownership.pendingCount === 1 && deleted.includes(shot1),
    'released shot must leave ownership after deletion',
  );

  ownership.take(finalShot);
  expect(
    (await ownership.releaseAll()) === 2,
    'unmount/final completion must delete every remaining shot',
  );
  expect(
    ownership.pendingCount === 0 &&
      deleted.includes(shot2) &&
      deleted.includes(finalShot),
    'the last exact-30 shot must not remain in cache ownership',
  );
  expect(
    (await ownership.releaseAll()) === 0,
    'repeated final cleanup must be idempotent',
  );

  console.log('faceCaptureLabTempImageOwnership tests passed');
}

void main().catch(error => {
  throw error;
});
