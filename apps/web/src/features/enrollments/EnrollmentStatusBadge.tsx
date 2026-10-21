import { enrollmentStatusPresentation } from './display';
import type { EnrollmentStatus } from './types';

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const presentation = enrollmentStatusPresentation[status];
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${presentation.className}`}
      data-testid={`enrollment-status-${status}`}
    >
      {presentation.label}
    </span>
  );
}
