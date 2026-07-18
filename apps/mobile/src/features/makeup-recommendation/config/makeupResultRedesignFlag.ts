/**
 * Toggles the makeup recommendation *result* screen between two layouts:
 *   true  → "Makeup Result v3" redesign (glass/gradient, 3-look hero, look map, share card)
 *   false → previous layout (static hero + context chips + area-guide carousel + AR button)
 *
 * Flip this constant to roll back or A/B the redesign. Both branches share the exact
 * same props contract, so nothing else needs to change. Can later be wired to an env
 * var / remote config if runtime toggling is needed.
 */
export const MAKEUP_RESULT_REDESIGN_ENABLED = true;
