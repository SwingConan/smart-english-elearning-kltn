import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Certificate, certificateApi, Readiness } from '@/features/certificates/api';

export function CertificatesPage() {
  const [items, setItems] = useState<Certificate[]>([]);
  useEffect(() => {
    void certificateApi.mine().then(setItems);
  }, []);
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-black">Chứng chỉ của tôi</h1>
      <div className="mt-7 grid gap-4">
        {items.map((item) => (
          <article className="rounded-2xl border bg-white p-5" key={item.id}>
            <strong>{item.courseTitleSnapshot}</strong>
            <p>
              {item.certificateNumber} · {item.revokedAt ? 'Đã thu hồi' : 'Còn hiệu lực'}
            </p>
            {!item.revokedAt ? (
              <a className="btn-secondary mt-3" href={certificateApi.downloadUrl(item.id)}>
                Tải bản in
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
export function EnrollmentCertificatePage() {
  const { enrollmentId = '' } = useParams();
  const [data, setData] = useState<Readiness | null>(null);
  const load = useCallback(
    () => certificateApi.readiness(enrollmentId).then(setData),
    [enrollmentId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!data) return <p role="status">Đang kiểm tra điều kiện…</p>;
  const certificate = data.completion?.certificate;
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-black">Hoàn thành & chứng chỉ</h2>
      <div className="rounded-2xl border bg-white p-6">
        <p>
          Tiến độ bài học: <strong>{data.evidence.lesson.percent}%</strong>
        </p>
        <p>
          Điểm danh: <strong>{data.evidence.attendance.percent ?? 'Chưa đủ dữ liệu'}</strong>
        </p>
        <p>
          Đánh giá cuối khóa:{' '}
          <strong>{data.evidence.finalAssessment.satisfied ? 'Đạt' : 'Chưa đạt'}</strong>
        </p>
        {data.unmet.length ? (
          <ul className="mt-4 list-disc pl-5 text-amber-800">
            {data.unmet.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {certificate ? (
          <a className="btn-primary mt-5" href={certificateApi.downloadUrl(certificate.id)}>
            Tải chứng chỉ
          </a>
        ) : (
          <button
            className="btn-primary mt-5"
            disabled={!data.eligible}
            onClick={() => void certificateApi.evaluate(enrollmentId).then(setData)}
          >
            Xác nhận hoàn thành
          </button>
        )}
      </div>
    </section>
  );
}
