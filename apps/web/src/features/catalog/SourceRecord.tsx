import { isTechnicalQaRecord } from './record-presentation';
import type { ReactNode } from 'react';

export function SourceRecord({
  name,
  code,
  courseTitle,
}: {
  name: string;
  code?: string;
  courseTitle?: string;
}) {
  if (!isTechnicalQaRecord(name, code, courseTitle)) return null;
  return (
    <details className="mt-2 text-sm text-slate-600">
      <summary className="cursor-pointer">Tên gốc và dữ liệu thử nghiệm (QA)</summary>
      <p>{name}</p>
      {code && <p>Mã: {code}</p>}
      {courseTitle && <p>Chương trình: {courseTitle}</p>}
      <p>
        Dữ liệu kiểm tra nội bộ được giữ để đối chiếu; không phải thông tin tuyển sinh công khai.
      </p>
    </details>
  );
}
export function QaRecordGate({
  qa,
  label = 'Bản ghi thử nghiệm (QA)',
  children,
}: {
  qa: boolean;
  label?: string;
  children: ReactNode;
}) {
  return qa ? (
    <details>
      <summary className="cursor-pointer font-semibold text-slate-600">
        {label} · Dữ liệu kiểm tra nội bộ
      </summary>
      <div className="mt-3 space-y-2">{children}</div>
    </details>
  ) : (
    <>{children}</>
  );
}
