/**
 * Correlation rules for Unity generated-mask applied events.
 *
 * Two failure modes these rules exist to prevent:
 * 1) A stale terminal event from a PREVIOUS request wiping the payload refs
 *    of the CURRENT request (mask ids differ, or ids are missing during the
 *    initial-generation window where the pending id is still null).
 * 2) A delayed ack for an OLDER control revision of the SAME mask id
 *    cancelling the retry loop of a NEWER revision before its first send.
 *
 * Both directions fail safe: when we cannot positively correlate, we do
 * nothing (keep retrying / keep the scheduled post) rather than destroy state.
 */

/**
 * Payload-level failures that can never succeed on resend (size/byte/id
 * mismatch). Shared by the lip and brow applied-event handlers.
 */
export const TERMINAL_GENERATED_MASK_BLOCKED_REASONS: readonly string[] = [
  'generated_lip_mask_texture_registration_failed',
  'generated_brow_mask_texture_registration_failed',
  'mask_texture_dimensions_invalid',
  'raw_rgba_byte_count_mismatch',
];

/**
 * A terminal event may clear state ONLY under positive correlation: the event
 * carries a mask id, we are actually waiting on one, and they match. Events
 * without an id, or arriving while no request is pending (e.g. the
 * initial-generation window sets the pending id to null), are NOT treated as
 * terminal — a stale event must never poison a new request.
 */
export function isTerminalGeneratedMaskEvent(
  event: {blockedReason?: string; generatedMaskId?: string},
  pendingMaskId: string | null,
): boolean {
  if (!event.blockedReason || !TERMINAL_GENERATED_MASK_BLOCKED_REASONS.includes(event.blockedReason)) {
    return false;
  }
  if (!event.generatedMaskId || !pendingMaskId) {
    return false;
  }
  return event.generatedMaskId === pendingMaskId;
}

/**
 * A scheduled native retry post may be cleared by an applied event ONLY when
 * the mask id matches, both sides carry a numeric control revision, and the
 * post's revision is not newer than the acked one. A delayed ack for an older
 * revision of the same mask (slider tweaks keep the mask id) must not cancel
 * a newer payload before its first send. Missing ids or revisions clear
 * nothing.
 */
export function shouldClearScheduledGeneratedMaskPost(
  post: {packageId?: string; revision?: number},
  appliedMaskId: string | undefined,
  appliedRevision: number | undefined,
): boolean {
  if (typeof appliedMaskId !== 'string' || appliedMaskId.length === 0) {
    return false;
  }
  if (post.packageId !== appliedMaskId) {
    return false;
  }
  if (typeof appliedRevision !== 'number' || typeof post.revision !== 'number') {
    return false;
  }
  return post.revision <= appliedRevision;
}
