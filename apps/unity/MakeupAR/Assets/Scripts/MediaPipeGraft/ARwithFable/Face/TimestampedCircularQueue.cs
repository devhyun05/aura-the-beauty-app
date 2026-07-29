using System;

namespace ARMakeup.Face
{
    /// <summary>
    /// Fixed-capacity circular queue that keeps preallocated slot indices in
    /// nondecreasing timestamp order. The current head remains occupied until a
    /// newer entry is eligible, so consumers can safely retain that slot.
    /// </summary>
    internal sealed class TimestampedCircularQueue
    {
        readonly double[] _timestamps;
        int _head;
        int _count;

        public TimestampedCircularQueue(int capacity)
        {
            if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity));
            _timestamps = new double[capacity];
        }

        public int Count => _count;
        public int Capacity => _timestamps.Length;

        /// <summary>Returns the physical tail slot without occupying it.</summary>
        public bool TryGetEnqueueSlot(out int slotIndex)
        {
            if (_count >= Capacity)
            {
                slotIndex = -1;
                return false;
            }

            slotIndex = PhysicalIndex(_count);
            return true;
        }

        /// <summary>Commits a timestamp after the caller has filled the reserved tail slot.</summary>
        public void CommitEnqueue(int slotIndex, double timestampMs)
        {
            if (_count >= Capacity)
                throw new InvalidOperationException("The circular queue is full.");
            if (double.IsNaN(timestampMs) || double.IsInfinity(timestampMs))
                throw new ArgumentOutOfRangeException(nameof(timestampMs));

            var expectedSlot = PhysicalIndex(_count);
            if (slotIndex != expectedSlot)
                throw new InvalidOperationException(
                    $"Slot {slotIndex} is not the current enqueue slot {expectedSlot}.");

            if (_count > 0)
            {
                var newestTimestamp = _timestamps[PhysicalIndex(_count - 1)];
                if (timestampMs < newestTimestamp)
                    throw new InvalidOperationException(
                        "Timestamps must be committed in nondecreasing order.");
            }

            _timestamps[slotIndex] = timestampMs;
            _count++;
        }

        /// <summary>
        /// Advances past obsolete heads and returns the newest queued entry whose
        /// timestamp is at or before <paramref name="targetTimestampMs"/>.
        /// The returned entry remains the occupied head until a later call advances it.
        /// </summary>
        public bool TryAdvanceToLatestAtOrBefore(
            double targetTimestampMs,
            out int slotIndex,
            out double timestampMs)
        {
            if (double.IsNaN(targetTimestampMs))
            {
                slotIndex = -1;
                timestampMs = -1.0;
                return false;
            }

            while (_count > 1)
            {
                var next = PhysicalIndex(1);
                if (_timestamps[next] > targetTimestampMs) break;
                _head = next;
                _count--;
            }

            if (_count == 0 || _timestamps[_head] > targetTimestampMs)
            {
                slotIndex = -1;
                timestampMs = -1.0;
                return false;
            }

            slotIndex = _head;
            timestampMs = _timestamps[_head];
            return true;
        }

        public void Reset()
        {
            _head = 0;
            _count = 0;
        }

        int PhysicalIndex(int logicalOffset) => (_head + logicalOffset) % Capacity;
    }
}
