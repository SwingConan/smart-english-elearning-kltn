import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { LearningReport, reportApi } from '@/features/reports/api';

export function LearningReportPage() {
  const { enrollmentId = '' } = useParams();
  const [report, setReport] = useState<LearningReport | null>(null);
  useEffect(() => {
    void reportApi.get(enrollmentId).then(setReport);
  }, [enrollmentId]);
  if (!report) return <p role="status">Đang tổng hợp báo cáo…</p>;
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-black">Báo cáo học tập</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Điểm danh"
          value={
            report.attendance.percent === null ? 'Chưa có dữ liệu' : `${report.attendance.percent}%`
          }
        />
        <Metric
          label="Buổi đã ghi nhận"
          value={`${report.attendance.markedSessions}/${report.attendance.totalSessions}`}
        />
        <Metric
          label="Sẵn sàng hoàn thành"
          value={report.completion.eligible ? 'Đạt' : 'Chưa đạt'}
        />
      </div>
      {report.modules.map((module) => (
        <article className="rounded-2xl border bg-white p-5" key={module.id}>
          <h3 className="font-bold">{module.title}</h3>
          <ul className="mt-3 space-y-2">
            {module.lessons.map((lesson) => (
              <li className="flex justify-between" key={lesson.id}>
                <span>{lesson.title}</span>
                <span>{lesson.status}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
      <div>
        <h3 className="text-lg font-bold">Gợi ý đang áp dụng</h3>
        {report.recommendations.map((item) => (
          <p className="mt-2 rounded-xl bg-indigo-50 p-4" key={item.id}>
            <strong>{item.title}</strong>
            <br />
            {item.actionText}
          </p>
        ))}
      </div>
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <strong className="mt-2 block text-xl">{value}</strong>
    </div>
  );
}
