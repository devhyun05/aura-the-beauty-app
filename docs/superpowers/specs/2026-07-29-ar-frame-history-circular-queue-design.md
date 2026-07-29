# AR Frame History Circular Queue Design

## Problem

`FaceLandmarkSource` calls its 14 preallocated display-frame slots a ring buffer, but the implementation searches from slot 0 for the first free slot, scans every slot to find the newest eligible timestamp, and scans every slot again to release old frames. The comment therefore describes a chronological circular buffer while the code behaves as an unordered reusable-slot pool.

The mismatch makes the ownership rule difficult to verify. In particular, `_presentedBuffer` is retained for color sampling even though the selected slot is immediately marked reusable.

## Decision

Replace the `inUse` flags and full-array scans with a fixed-capacity, timestamp-ordered circular queue over the same 14 preallocated `NativeArray` slots.

- Capture appends at the logical tail.
- Presentation advances the head while the following frame is also at or before the presentation timestamp.
- The remaining head is the newest eligible frame and stays occupied until a newer frame supersedes it.
- When all 14 slots are occupied, display capture is skipped as before; MediaPipe detection continues.
- Reset clears only queue indices and tracking state. Allocated pixel buffers remain reusable.

This preserves bounded memory and allocation-free steady-state reuse. The principal benefit is explicit chronological and lifetime invariants, not a claimed measurable speedup: with only 14 slots, removing linear scans is a small constant-factor improvement.

## Verification

EditMode tests cover capacity exhaustion, newest-at-or-before selection, retention of future frames, wrap-around slot reuse, and reset. Verify the production assembly with Unity's generated compiler response and run the queue tests with Unity's NUnit dependency. The full Editor runner remains a separate environment check when a headless Unity license is available.
