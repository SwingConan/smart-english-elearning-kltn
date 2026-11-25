import { useState } from 'react';
import { MANUAL_MEET_ERROR, MANUAL_MEET_PATTERN } from './manual-meet';

export function ManualMeetField({ label, className, value, onChange }: {
  label: string; className?: string; value?: string; onChange?: (value: string) => void;
}) {
  const [error, setError] = useState('');
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Giảng viên <a className="font-semibold text-indigo-700 underline" href="https://meet.google.com" target="_blank" rel="noopener noreferrer">tạo phòng tại Google Meet</a>, sao chép link rồi dán bên dưới. Smart English không tự tạo phòng. Học viên chỉ nhận link sau khi học vụ duyệt.
      </p>
      <label className="block space-y-1 text-sm font-medium">
        {label}
        <input name="url" type="url" required maxLength={100} pattern={MANUAL_MEET_PATTERN}
          className={className} value={value} placeholder="https://meet.google.com/xxx-xxxx-xxx"
          aria-invalid={Boolean(error)}
          onInvalid={(event) => { event.currentTarget.setCustomValidity(MANUAL_MEET_ERROR); setError(MANUAL_MEET_ERROR); }}
          onChange={(event) => { event.currentTarget.setCustomValidity(''); setError(''); onChange?.(event.target.value); }} />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-slate-500">Link đúng định dạng chưa chứng minh phòng tồn tại. Chủ tài khoản Google chịu trách nhiệm tạo phòng và cho người tham gia vào.</p>
    </div>
  );
}
