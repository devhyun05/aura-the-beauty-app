# AR Frame History Circular Queue Implementation Plan

> **For agentic workers:** Implement with test-first development and verify each task before committing.

**Goal:** Make the delayed display-frame history in `FaceLandmarkSource` a genuine fixed-capacity circular queue whose code matches its documented chronological behavior.

**Architecture:** Keep the existing 14 preallocated pixel buffers. Extract only head/count/timestamp ordering into an internal `TimestampedCircularQueue`; `FaceLandmarkSource` continues to own conversion, presentation, and `NativeArray` lifetimes.

**Tech Stack:** Unity 6, C#, NUnit EditMode tests, Git.

### Task 1: Lock the queue contract with failing tests

**Files:**
- Create: `apps/unity/MakeupAR/Assets/Tests/ARwithFable/TimestampedCircularQueueTests.cs`

- [ ] Test full-capacity rejection.
- [ ] Test newest-frame-at-or-before selection while retaining future frames.
- [ ] Test wrap-around reuse and pinning of the current head.
- [ ] Test reset.
- [ ] Run the focused EditMode suite and confirm failure because the queue does not exist yet.

### Task 2: Implement and integrate the circular queue

**Files:**
- Create: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/TimestampedCircularQueue.cs`
- Create: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/AssemblyInfo.cs`
- Modify: `apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/ARwithFable/Face/FaceLandmarkSource.cs`

- [ ] Implement fixed-capacity chronological enqueue, head advancement, and reset.
- [ ] Replace `inUse` scans with queue tail/head operations.
- [ ] Keep the presented head occupied until superseded so `_presentedBuffer` remains owned.
- [ ] Update comments and names to use the official circular-queue terminology.

### Task 3: Verify and record the decision

- [ ] Run the focused queue tests.
- [ ] Run the ARwithFable EditMode test assembly.
- [ ] Review the diff and confirm unrelated iOS/resume files are unstaged.
- [ ] Commit only the queue refactor, tests, and decision records with the problem and tradeoff in the commit body.
