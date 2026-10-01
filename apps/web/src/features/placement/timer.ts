export type PlacementTimerWarning = 'FIVE_MINUTES' | 'ONE_MINUTE' | null;

export function placementTimerWarning(
  remainingSeconds: number,
  fiveMinuteWarningShown: boolean,
  oneMinuteWarningShown: boolean,
): PlacementTimerWarning {
  if (remainingSeconds <= 60 && remainingSeconds > 0 && !oneMinuteWarningShown) {
    return 'ONE_MINUTE';
  }
  if (
    remainingSeconds <= 300 &&
    remainingSeconds > 60 &&
    !fiveMinuteWarningShown
  ) {
    return 'FIVE_MINUTES';
  }
  return null;
}
