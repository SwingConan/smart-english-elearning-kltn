export function navigateAfterPasswordReset(): void {
  window.location.assign('/login?reset=1');
}
