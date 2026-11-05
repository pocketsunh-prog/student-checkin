/**
 * Testable clock. Production code should call `now()` instead of `new Date()`
 * so integration tests can freeze time deterministically.
 */
let offsetMs = 0;

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

/** Freeze `now()` at a specific instant (used by tests). */
export function freezeClock(at: Date): void {
  offsetMs = at.getTime() - Date.now();
}

/** Restore the real clock (used by tests). */
export function resetClock(): void {
  offsetMs = 0;
}
