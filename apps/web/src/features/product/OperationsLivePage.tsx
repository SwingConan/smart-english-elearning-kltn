import { Link } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import {
  formatReadinessDomain,
  formatReadinessReason,
  SERVICE_STATUS_META,
  classifyReadinessSource,
} from '@/features/workspace/admin-presentation';
import { useProductRead, type OperationsReadiness } from './api';

export function OperationsLivePage() {
  const { user } = useAuth();
  const {
    phase,
    data: response,
    reload,
  } = useProductRead<OperationsReadiness>('/v2/operations/readiness');
  const data =
    response?.viewerId === user?.id && response?.role === user?.role ? response : undefined;
  return (
    <div className="section-shell min-w-0 space-y-6 py-8">
      <Link className="text-indigo-700 underline" to="/workspace">
        ← Không gian làm việc
      </Link>
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow">Vận hành và báo cáo</p>
          <h1 className="mt-2 text-3xl font-bold">Tình trạng tích hợp nguồn dữ liệu</h1>
        </div>
        <button className="btn-secondary" onClick={reload}>
          Xác minh lại
        </button>
      </header>
      {phase === 'LOADING' && <p role="status">Đang đọc trạng thái từ API…</p>}
      {(phase === 'DENIED' || (response && !data)) && (
        <p role="alert">Phiên hoặc vai trò không phù hợp với nguồn phản hồi.</p>
      )}
      {phase === 'ERROR' && (
        <p role="alert">
          Nguồn vận hành chưa truy cập được. Hệ thống không tự suy diễn trạng thái mặc định.
        </p>
      )}
      {data && (
        <>
          <section className="card space-y-3 p-5">
            <h2 className="text-xl font-semibold">Phạm vi tích hợp đang mở rộng</h2>
            <p>
              Trạng thái tổng hợp: <strong>Chưa thể xác định đầy đủ</strong>. Phiên đăng nhập đã được xác
              minh; một số nguồn tự động liên phân hệ đang ở chế độ bảo vệ an toàn.
            </p>
            <p className="text-sm text-slate-600">
              Các tác vụ quản trị tài khoản, phân quyền, nhật ký kiểm toán và cấu hình tại Trung tâm Vận hành vẫn hoạt động bình thường.
            </p>
          </section>
          <div
            className="overflow-x-auto rounded-xl border"
            tabIndex={0}
            aria-label="Nguồn dữ liệu và giới hạn tích hợp"
          >
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="p-4 text-left font-semibold">
                Tình trạng kết nối nguồn theo từng phân hệ
              </caption>
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3" scope="col">
                    Phân hệ nguồn
                  </th>
                  <th className="p-3" scope="col">
                    Trạng thái
                  </th>
                  <th className="p-3" scope="col">
                    Chi tiết kỹ thuật
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((s) => {
                  const meta = SERVICE_STATUS_META[classifyReadinessSource(s.state)];
                  return (
                    <tr key={s.domain} className="border-t">
                      <th scope="row" className="p-3 font-medium">
                        {formatReadinessDomain(s.domain)}
                      </th>
                      <td className="p-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="break-words p-3">{formatReadinessReason(s.reason)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-secondary" to="/workspace/operations">
              Mở Trung tâm Nhật ký &amp; Vận hành
            </Link>
            <Link className="btn-secondary" to="/workspace/reports">
              Mở Báo cáo Hệ thống &amp; Kiểm toán
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
