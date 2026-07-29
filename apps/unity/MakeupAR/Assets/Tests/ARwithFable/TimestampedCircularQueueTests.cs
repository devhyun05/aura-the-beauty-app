using ARMakeup.Face;
using NUnit.Framework;

namespace Aura.ARwithFable.Tests
{
    public sealed class TimestampedCircularQueueTests
    {
        [Test]
        public void RejectsEnqueueWhenEverySlotIsOccupied()
        {
            var queue = new TimestampedCircularQueue(2);

            Enqueue(queue, 10.0, 0);
            Enqueue(queue, 20.0, 1);

            Assert.That(queue.TryGetEnqueueSlot(out _), Is.False);
        }

        [Test]
        public void AdvancesToNewestFrameAtOrBeforeTargetAndRetainsFutureFrame()
        {
            var queue = new TimestampedCircularQueue(4);
            Enqueue(queue, 10.0, 0);
            Enqueue(queue, 20.0, 1);
            Enqueue(queue, 30.0, 2);

            Assert.That(
                queue.TryAdvanceToLatestAtOrBefore(25.0, out var slot, out var timestamp),
                Is.True);
            Assert.That(slot, Is.EqualTo(1));
            Assert.That(timestamp, Is.EqualTo(20.0));
            Assert.That(queue.Count, Is.EqualTo(2));

            Assert.That(
                queue.TryAdvanceToLatestAtOrBefore(29.0, out slot, out timestamp),
                Is.True);
            Assert.That(slot, Is.EqualTo(1));
            Assert.That(timestamp, Is.EqualTo(20.0));
            Assert.That(queue.Count, Is.EqualTo(2));
        }

        [Test]
        public void ReusesReleasedSlotsInCircularOrderWithoutOverwritingCurrentHead()
        {
            var queue = new TimestampedCircularQueue(3);
            Enqueue(queue, 10.0, 0);
            Enqueue(queue, 20.0, 1);
            Enqueue(queue, 30.0, 2);

            Assert.That(queue.TryAdvanceToLatestAtOrBefore(25.0, out var slot, out _), Is.True);
            Assert.That(slot, Is.EqualTo(1));

            // Slot 1 is the displayed head and slot 2 is still in the future, so the
            // released oldest slot 0 is the next tail after wrap-around.
            Enqueue(queue, 40.0, 0);

            Assert.That(queue.TryAdvanceToLatestAtOrBefore(40.0, out slot, out var timestamp), Is.True);
            Assert.That(slot, Is.EqualTo(0));
            Assert.That(timestamp, Is.EqualTo(40.0));
            Assert.That(queue.Count, Is.EqualTo(1));
        }

        [Test]
        public void ReturnsNoFrameWhenTargetPrecedesOldestTimestamp()
        {
            var queue = new TimestampedCircularQueue(2);
            Enqueue(queue, 10.0, 0);

            Assert.That(
                queue.TryAdvanceToLatestAtOrBefore(9.0, out _, out _),
                Is.False);
            Assert.That(queue.Count, Is.EqualTo(1));
        }

        [Test]
        public void ResetEmptiesLogicalQueueButRestartsAtFirstSlot()
        {
            var queue = new TimestampedCircularQueue(2);
            Enqueue(queue, 10.0, 0);

            queue.Reset();

            Assert.That(queue.Count, Is.Zero);
            Assert.That(queue.TryGetEnqueueSlot(out var slot), Is.True);
            Assert.That(slot, Is.Zero);
        }

        static void Enqueue(TimestampedCircularQueue queue, double timestamp, int expectedSlot)
        {
            Assert.That(queue.TryGetEnqueueSlot(out var slot), Is.True);
            Assert.That(slot, Is.EqualTo(expectedSlot));
            queue.CommitEnqueue(slot, timestamp);
        }
    }
}
