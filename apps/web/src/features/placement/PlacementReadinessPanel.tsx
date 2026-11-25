import { useEffect, useState } from 'react';
import { workflow } from './workflow-api';
type Readiness = {
  asOf: string;
  content: {
    available: Record<string, number>;
    missing: Record<string, number>;
    assets: { state: string }[];
    invalidObjectiveKeys: number;
    missingTaskRubrics: number;
  };
  matching: {
    approvedCriteria: string[];
    classCount: number;
    classesWithPinnedVersion: number;
    classesWithFutureStart: number;
    classesWithOpenAdmission: number;
  };
};
export function PlacementReadinessPanel() {
  const [data, setData] = useState<Readiness>(),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    void workflow
      .get<Readiness>('/readiness', c.signal)
      .then(setData)
      .catch(() => {
        if (!c.signal.aborted) setError('Chưa đọc được tình trạng nguồn đề và tiêu chí hiện hành.');
      });
    return () => c.abort();
  }, []);
  const modeLabel = (m: string) =>
    m === 'LR' ? 'Listening & Reading' : m === 'FOUR_SKILLS' ? '4 kỹ năng (L/R/S/W)' : m;
  const skillLabel = (s: string) =>
    ({
      LISTENING: 'Nghe (Listening)',
      READING: 'Đọc (Reading)',
      SPEAKING: 'Nói (Speaking)',
      WRITING: 'Viết (Writing)',
      LR: 'Nghe & Đọc',
      FOUR_SKILLS: '4 kỹ năng',
    })[s] ?? s;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">Điều kiện sẵn sàng cho bài thi đầu vào chính thức</h2>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {data && (
        <div className="grid gap-3 text-xs text-slate-700 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
            <p className="font-bold text-slate-900">Ngân hàng câu hỏi &amp; Tài nguyên</p>
            <p>
              Hiện có:{' '}
              {Object.entries(data.content.available)
                .map(([skill, n]) => `${skillLabel(skill)}: ${n}`)
                .join(' · ') || 'Chưa có'}
            </p>
            <p>
              Còn thiếu:{' '}
              {Object.entries(data.content.missing)
                .map(([skill, n]) => `${skillLabel(skill)}: ${n}`)
                .join(' · ') || 'Đủ'}
            </p>
            <p>
              Tài nguyên media đã xác minh:{' '}
              {data.content.assets.filter((a) => a.state === 'VERIFIED').length}/
              {data.content.assets.length} tệp.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
            <p className="font-bold text-slate-900">Tiêu chí xếp lớp &amp; Tuyển sinh</p>
            <p>
              Chế độ đã duyệt tiêu chí xếp lớp:{' '}
              {data.matching.approvedCriteria.map(modeLabel).join(', ') || 'Chưa có'}
            </p>
            <p>
              {data.matching.classCount} lớp hiện có · {data.matching.classesWithPinnedVersion} lớp
              đã chốt chương trình · {data.matching.classesWithFutureStart} lớp sắp khai giảng ·{' '}
              {data.matching.classesWithOpenAdmission} lớp đang nhận ghi danh.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
