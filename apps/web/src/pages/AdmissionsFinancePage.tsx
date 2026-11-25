import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { apiFetch, apiUrl, ApiError } from '@/lib/api-client';
import type { CashierWorkspaceData } from '@/features/workspace/UnifiedCashierTuitionPanel';
import { paymentRetry } from '@/features/admissions/receipt-retry';
import { button, field } from '@/features/class-lms/api';
import {
  admissionsBase,
  readAdmission,
  W07Consent,
  type ApplicationRow,
  type Detail,
  type Offer,
  vnd,
  admissionLabel,
} from '@/features/admissions/api';
import {
  accountLabel,
  classLabel,
  isTechnicalQaRecord,
} from '@/features/catalog/record-presentation';
import { SourceRecord } from '@/features/catalog/SourceRecord';
import { StudentFinancePage } from '@/features/learner/StudentFinancePage';
import {
  numberToVietnameseWords,
  printCashierReceiptDocument,
} from '@/features/operations/cashier-financial-export';
function TestBanner() {
  const [approved, setApproved] = useState(false);
  useEffect(() => {
    let live = true;
    void readAdmission<{ approvedQa: boolean }>('configuration')
      .then((x) => {
        if (live) setApproved(x.approvedQa);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (approved)
    return (
      <aside className="workspace-card border-l-4 border-l-indigo-600 bg-indigo-50/60" role="note">
        <strong className="text-indigo-950">Chính sách tuyển sinh & học phí đã duyệt</strong>
        <p className="mt-1 text-sm text-slate-700">
          Giá và phiên bản chương trình đã được duyệt theo phạm vi lớp. Gửi hồ sơ không giữ chỗ;
          quyền học chỉ mở khi hoàn tất đủ điều kiện học vụ và tài chính.
        </p>
      </aside>
    );
  return (
    <aside className="workspace-card border-l-4 border-l-amber-500 bg-amber-50/70" role="note">
      <strong className="text-amber-950">Lưu ý về chứng từ trình diễn</strong>
      <p className="mt-1 text-sm text-amber-900">
        Không có giao dịch ngân hàng thật. Không tải thông tin ngân hàng/giấy tờ cá nhân thật. Ảnh
        tải lên không xác nhận tiền; xét duyệt học vụ không giữ chỗ.
      </p>
    </aside>
  );
}
function useCommand() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const running = useRef(false),
    keys = useRef(new Map<string, string>());
  async function send<T>(
    path: string,
    body: Record<string, unknown>,
    file?: File,
  ): Promise<T | undefined> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (file && (file.size === 0 || file.size > 5 * 1024 * 1024))
        throw new Error('INVALID_RETRY_FILE');
      const fileHash = file
        ? Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
          )
            .map((x) => x.toString(16).padStart(2, '0'))
            .join('')
        : '';
      const signature = path + JSON.stringify(body) + fileHash;
      const retry = file
        ? paymentRetry(
            user?.id ?? '',
            Array.from(
              new Uint8Array(
                await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature)),
              ),
            )
              .map((x) => x.toString(16).padStart(2, '0'))
              .join(''),
            sessionStorage,
          )
        : null;
      let key = keys.current.get(signature);
      if (retry) key = retry.key;
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(signature, key);
      }
      let payload: BodyInit;
      if (file) {
        const form = new FormData();
        Object.entries({ ...body, key }).forEach(([k, v]) => form.set(k, String(v)));
        form.set('file', file);
        payload = form;
      } else payload = JSON.stringify({ ...body, key });
      let result: T;
      if (retry?.existing && file) {
        try {
          const receipt = await apiFetch<{
            id: string;
            sha256: string;
            bytes: number;
            amountVnd: number;
            sourceRef: string;
          }>(admissionsBase + path + '/receipts/' + key);
          if (
            receipt.sha256 !== fileHash ||
            receipt.bytes !== file.size ||
            receipt.amountVnd !== Number(body.amountVnd) ||
            receipt.sourceRef !== body.sourceRef
          )
            throw new ApiError(409, null);
          result = receipt as T;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
          result = await apiFetch<T>(admissionsBase + path, { method: 'POST', body: payload });
        }
      } else result = await apiFetch<T>(admissionsBase + path, { method: 'POST', body: payload });
      retry?.acknowledge();
      keys.current.delete(signature);
      setMessage(
        'Đã lưu biên nhận trình diễn. Thao tác này không xác nhận tiền thật hoặc chi trả hoàn tiền.',
      );
      return result;
    } catch (e) {
      setError(
        e instanceof Error && /^(INVALID_RETRY_|RETRY_STORAGE_)/.test(e.message)
          ? 'Không lưu được khóa retry an toàn; chưa gửi chứng từ. Giữ nguyên file và thông tin, kiểm tra bộ nhớ phiên trước khi thử lại.'
          : e instanceof ApiError && [401, 403, 404].includes(e.status)
            ? 'Phiên hoặc quyền hiện hành không cho phép thao tác này.'
            : 'Không lưu được: kiểm tra phiên bản, file, số tiền nguyên VND và quyền. Nội dung/khóa retry được giữ nguyên; tải trạng thái đã lưu trước khi thử lại.',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, error, message, send };
}
function Feedback({ command }: { command: ReturnType<typeof useCommand> }) {
  return (
    <>
      {command.error && (
        <p role="alert" className="text-red-700">
          {command.error}
        </p>
      )}
      {command.message && <p role="status">{command.message}</p>}
    </>
  );
}
export function AdmissionsPage() {
  const { user } = useAuth();
  if (user?.role === 'STUDENT') return <StudentFinancePage />;
  return <AdmissionsContent key={`${user?.id}:${user?.role}`} />;
}
function AdmissionsContent() {
  const [search] = useSearchParams(),
    navigate = useNavigate(),
    [offers, setOffers] = useState<Offer[]>(),
    [mine, setMine] = useState<ApplicationRow[]>(),
    [referrals, setReferrals] = useState<{ id: string; number: number; classId: string | null }[]>(
      [],
    ),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(search.get('classId') ?? ''),
    c = useCommand();
  useEffect(() => {
    let live = true;
    void Promise.all([
      readAdmission<{ data: Offer[] }>('offers'),
      readAdmission<{ data: ApplicationRow[] }>('applications/mine'),
      readAdmission<{ data: typeof referrals }>('referrals'),
    ])
      .then(([o, m, r]) => {
        if (live) {
          setOffers(o.data);
          setMine(m.data);
          setReferrals(r.data);
          setSelected((s) => s || o.data[0]?.id || '');
        }
      })
      .catch(() => {
        if (live) setError('Không thể tải tiếp nhận nhập học trong phạm vi được phép.');
      });
    return () => {
      live = false;
    };
  }, []);
  const offer = offers?.find((x) => x.id === selected);
  async function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      referralId = String(d.get('referralId') ?? '');
    const r = await c.send<{ id: string }>('applications', {
      classId: selected,
      consent: true,
      consentVersion: offer?.consentVersion ?? W07Consent,
      ...(referralId ? { referralId } : {}),
    });
    if (r) navigate('/admissions/' + r.id);
  }
  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <span className="badge-info">Tuyển sinh & Học phí</span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          Nhập học và học phí
        </h1>
      </header>
      <TestBanner />
      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}
      {!offers && !error && (
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang tải lớp tiếp nhận…
        </p>
      )}
      {offers && (
        <form className="workspace-card space-y-4" onSubmit={(e) => void apply(e)}>
          <h2 className="text-xl font-bold text-slate-950">Gửi hồ sơ trực tiếp</h2>
          <label className="block space-y-1 text-sm font-semibold text-slate-700">
            Lớp tiếp nhận
            <select
              className={field}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              required
            >
              <option value="">Chọn lớp</option>
              {offers.map((x) => (
                <option key={x.id} value={x.id}>
                  {classLabel(x.code, x.name)}
                </option>
              ))}
            </select>
          </label>
          {offer && (
            <div className="workspace-subcard space-y-1 text-sm text-slate-700">
              <p>
                {isTechnicalQaRecord(offer.course) ? 'Chương trình học tham khảo' : offer.course} ·
                Học phí áp dụng cho lớp: {vnd(offer.amountVnd)} ·{' '}
                {offer.remainingSeats === null
                  ? 'Sĩ số chưa xác định'
                  : offer.remainingSeats + ' chỗ hiện có (không giữ chỗ)'}
                {!offer.ready && ' · Thiếu chính sách/nguồn giá: hồ sơ sẽ cần xem xét.'}
              </p>
              <SourceRecord name={offer.name} code={offer.code} courseTitle={offer.course} />
            </div>
          )}
          <label className="block space-y-1 text-sm font-semibold text-slate-700">
            Hồ sơ tư vấn đã xác minh (không bắt buộc)
            <select className={field} name="referralId" key={selected}>
              <option value="">Không đính kèm nguồn tư vấn</option>
              {referrals
                .filter((x) => !x.classId || x.classId === selected)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    Hồ sơ tư vấn v{x.number}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700">
            <input type="checkbox" required name="consent" className="mt-0.5 size-4" />
            <span>
              {offer?.consentVersion === 'W07_DEC071_ADMISSION_V1'
                ? 'Tôi đồng ý gửi hồ sơ theo lớp, giá và điều khoản đã duyệt. Tôi hiểu không giữ chỗ hoặc cấp quyền học trước khi đủ điều kiện thanh toán.'
                : 'Tôi đồng ý gửi hồ sơ theo thông tin và giá phiên bản hiển thị. Không giữ chỗ hoặc tự cấp quyền học.'}
            </span>
          </label>
          <button disabled={c.busy || !offer} className={button}>
            {offer?.consentVersion === 'W07_DEC071_ADMISSION_V1'
              ? 'Gửi hồ sơ theo giá đã duyệt'
              : 'Gửi hồ sơ nhập học'}
          </button>
          <Feedback command={c} />
        </form>
      )}
      <section className="workspace-card space-y-3">
        <h2 className="text-xl font-bold text-slate-950">Hồ sơ và biên nhận của tôi</h2>
        {mine?.map((x) => (
          <Link
            className="workspace-subcard block bg-white transition hover:border-indigo-300"
            key={x.id}
            to={'/admissions/' + x.id}
          >
            <span className="font-semibold text-slate-900">
              {classLabel(x.class.code, x.class.name)}
            </span>{' '}
            · v{x.number} · <span className="badge-info">{admissionLabel(x.state)}</span> ·{' '}
            <strong className="text-indigo-950">{vnd(x.amountVnd)}</strong>
          </Link>
        ))}
        {mine?.length === 0 && (
          <p className="text-sm text-slate-600">
            Chưa có hồ sơ. Tạo hồ sơ không tạo đăng ký học ACTIVE.
          </p>
        )}
      </section>
    </main>
  );
}
type StaffClass = {
  id: string;
  code: string;
  name: string;
  status: string;
  versionId: string | null;
  approvedTuitionFeeVnd: number | null;
  w07ClassControlClass: { id: string }[];
};
type CashierTab = 'obligations' | 'receipts' | 'debt' | 'cases';

const cashierStatusLabels: Record<string, string> = {
  UNPAID: 'Chưa thanh toán',
  PARTIAL: 'Thu một phần',
  PAID: 'Đã thu đủ',
  OVERPAID: 'Nộp dư',
  NEEDS_RECONCILIATION: 'Cần đối soát',
  EXPIRED: 'Quá hạn giữ chỗ',
};

const cashierEnrollLabels: Record<string, string> = {
  ACTIVE: 'Đang theo học',
  PENDING_PAYMENT: 'Chờ thanh toán',
  CANCELLED: 'Đã hủy',
  COMPLETED: 'Hoàn thành',
};

const cashierVerifyLabels: Record<string, string> = {
  SEPAY_AUTO_VERIFIED: 'Xác nhận tự động SePay',
  CASHIER_MANUAL_VERIFIED: 'Thu ngân đối soát thủ công',
  DEV_SYNTHETIC_TEST_HARNESS: 'Mô phỏng kiểm thử',
};

const cashierActionLabels: Record<string, string> = {
  SEPAY_AUTO_SETTLED: 'Tự động khớp & cấp phiếu thu',
  CASHIER_CONFIRM_MATCH_AND_ACTIVATE: 'Thu ngân xác nhận đủ tiền',
  CASHIER_MARK_PARTIAL_KEEP_PENDING: 'Thu ngân ghi nhận thu một phần',
  CASHIER_MARK_REFUND_NEEDED: 'Thu ngân đánh dấu cần hoàn tiền',
  CASHIER_REJECT_UNMATCHED: 'Thu ngân từ chối / Không khớp',
  SEAT_HOLD_CREATED: 'Khởi tạo giữ chỗ chờ thanh toán',
  HOLD_EXPIRED_RELEASED: 'Hết hạn giữ chỗ · Giải phóng lớp',
  RECEIVABLE_CREATED: 'Tạo khoản phải thu',
  RECEIPT_ISSUED: 'Phát hành phiếu thu',
};

const formatCashierActionNote = (note: string): string => {
  if (/^15-minute seat hold created/i.test(note)) {
    return 'Hệ thống giữ chỗ 15 phút khi học viên đăng ký lớp trực tiếp.';
  }
  if (/hold expired/i.test(note) || (/expired/i.test(note) && /seat/i.test(note))) {
    return 'Hết hạn giữ chỗ 15 phút mà chưa có thanh toán hợp lệ; hệ thống đã tự động hoàn trả chỗ vào lớp.';
  }
  const exactMatch = /^Exact transfer\s+(\d+)\s*VND reconciled/i.exec(note);
  if (exactMatch) {
    return `Đã đối soát khớp chính xác ${Number(exactMatch[1]).toLocaleString('vi-VN')} đ và tự động phát hành phiếu thu.`;
  }
  return note;
};

function formatReceiptDayParts(iso: string): { day: string; month: string; year: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '--', month: '--', year: '----' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? '--';
  return { day: pick('day'), month: pick('month'), year: pick('year') };
}

function receiptVnDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function CashierAdmissionsContent() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [cashierData, setCashierData] = useState<CashierWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [classFilter, setClassFilter] = useState('ALL');
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [receiptClassFilter, setReceiptClassFilter] = useState('ALL');
  const [receiptMethodFilter, setReceiptMethodFilter] = useState('ALL');
  const [receiptFromDate, setReceiptFromDate] = useState('');
  const [receiptToDate, setReceiptToDate] = useState('');
  const [selectedReceivable, setSelectedReceivable] = useState<
    CashierWorkspaceData['receivables'][number] | null
  >(null);
  const [selectedReceipt, setSelectedReceipt] = useState<
    CashierWorkspaceData['receipts'][number] | null
  >(null);

  const activeTab: CashierTab =
    location.hash === '#receipts'
      ? 'receipts'
      : location.hash === '#debt'
        ? 'debt'
        : location.hash === '#cases'
          ? 'cases'
          : 'obligations';

  useEffect(() => {
    let live = true;
    void apiFetch<CashierWorkspaceData>('/v2/payments/sepay/cashier')
      .then((res) => {
        if (live) {
          setCashierData(res);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setCashierData(null);
          setError('Bạn chưa có quyền mở trang này hoặc quyền đã hết hiệu lực.');
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const switchCashierTab = (tab: CashierTab) => {
    setSearchQuery('');
    setStateFilter('ALL');
    setClassFilter('ALL');
    setOnlyUnpaid(false);
    const hash = tab === 'obligations' ? '' : '#' + tab;
    navigate('/workspace/admissions' + hash, { replace: true });
  };

  const classOptions = Array.from(
    new Map(
      [
        ...(cashierData?.receivables ?? []).map((r) => [
          r.classOffering.id,
          { id: r.classOffering.id, code: r.classOffering.code, name: r.classOffering.name },
        ]),
        ...(cashierData?.receipts ?? []).map((rc) => [
          rc.classOffering.id,
          { id: rc.classOffering.id, code: rc.classOffering.code, name: rc.classOffering.name },
        ]),
      ] as Array<[string, { id: string; code: string; name: string }]>,
    ).values(),
  ).sort((a, b) => a.code.localeCompare(b.code));

  const q = searchQuery.trim().toLowerCase();
  const filteredReceivables = (cashierData?.receivables ?? []).filter((r) => {
    if (classFilter !== 'ALL' && r.classOffering.id !== classFilter) return false;
    if (stateFilter !== 'ALL' && r.status !== stateFilter) return false;
    if (onlyUnpaid && r.status === 'PAID') return false;
    if (!q) return true;
    return (
      r.receivableCode.toLowerCase().includes(q) ||
      r.classOffering.code.toLowerCase().includes(q) ||
      r.classOffering.name.toLowerCase().includes(q) ||
      r.learner.fullName.toLowerCase().includes(q) ||
      r.learner.email.toLowerCase().includes(q)
    );
  });

  const filteredReceipts = (cashierData?.receipts ?? []).filter((rc) => {
    if (receiptClassFilter !== 'ALL' && rc.classOffering.id !== receiptClassFilter) return false;
    if (receiptMethodFilter !== 'ALL' && rc.verificationMethod !== receiptMethodFilter) return false;
    const issuedDay = receiptVnDateOnly(rc.issuedAt);
    if (receiptFromDate && issuedDay && issuedDay < receiptFromDate) return false;
    if (receiptToDate && issuedDay && issuedDay > receiptToDate) return false;
    if (!q) return true;
    return (
      rc.receiptNumber.toLowerCase().includes(q) ||
      rc.classOffering.code.toLowerCase().includes(q) ||
      rc.classOffering.name.toLowerCase().includes(q) ||
      rc.learner.fullName.toLowerCase().includes(q) ||
      rc.learner.email.toLowerCase().includes(q)
    );
  });

  const pendingTxs = (cashierData?.transactions ?? []).filter(
    (t) => t.reconciliationState === 'PENDING_CASHIER_REVIEW',
  );

  const debtByClass = Object.values(
    (cashierData?.receivables ?? []).reduce<
      Record<
        string,
        {
          id: string;
          code: string;
          name: string;
          totalDue: number;
          totalPaid: number;
          count: number;
          unpaidCount: number;
        }
      >
    >((acc, r) => {
      const cur = acc[r.classOffering.id] ?? {
        id: r.classOffering.id,
        code: r.classOffering.code,
        name: r.classOffering.name,
        totalDue: 0,
        totalPaid: 0,
        count: 0,
        unpaidCount: 0,
      };
      cur.totalDue += r.amountVnd;
      cur.totalPaid += r.paidAmountVnd;
      cur.count += 1;
      if (r.status !== 'PAID') cur.unpaidCount += 1;
      acc[r.classOffering.id] = cur;
      return acc;
    }, {}),
  ).filter((cls) => {
    if (onlyUnpaid && cls.unpaidCount === 0) return false;
    if (!q) return true;
    return cls.code.toLowerCase().includes(q) || cls.name.toLowerCase().includes(q);
  });

  const isReceivablesOrDebtSection = activeTab === 'obligations' || activeTab === 'debt';
  const pageHeading =
    activeTab === 'receipts'
      ? 'Phiếu thu & Chứng từ đã ghi nhận'
      : activeTab === 'cases'
        ? 'Trường hợp cần xử lý & Nhật ký đối soát'
        : 'Khoản phải thu & Công nợ theo lớp';
  const pageSubtitle =
    activeTab === 'receipts'
      ? 'Tra cứu, lọc theo lớp/phương thức/ngày và xem hoặc in phiếu thu học phí chuẩn chứng từ.'
      : activeTab === 'cases'
        ? 'Theo dõi các giao dịch chuyển khoản lệch chuẩn cần xử lý và lịch sử thao tác đối soát.'
        : 'Theo dõi khoản phải thu từng học viên, lọc nhanh theo lớp học và đối chiếu công nợ theo lớp.';

  return (
    <div className="workspace-page space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-5">
        <span className="inline-flex items-center rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
          Không gian Thu ngân · Học phí &amp; Phiếu thu
        </span>
        <h1 className="mt-1.5 text-2xl font-bold text-[#e66f2b] sm:text-3xl">{pageHeading}</h1>
        <p className="mt-1 text-sm text-slate-600">{pageSubtitle}</p>
      </header>

      {isReceivablesOrDebtSection && (
        <nav
          aria-label="Khu vực khoản phải thu và công nợ"
          className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
        >
          {(
            [
              ['obligations', `Khoản phải thu (${cashierData?.receivables.length ?? 0})`],
              ['debt', `Công nợ theo lớp (${debtByClass.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchCashierTab(key)}
              className={`rounded px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === key
                  ? 'bg-[#76a35e] text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}

      {loading && !cashierData && !error && (
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang tải sổ khoản phải thu và phiếu thu…
        </p>
      )}

      {isReceivablesOrDebtSection && cashierData && (
        <section className="workspace-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-[#e66f2b]">
              {activeTab === 'debt'
                ? 'Công nợ học viên theo lớp học'
                : 'Danh sách khoản phải thu học phí'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Lọc theo lớp học"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="max-w-[230px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value="ALL">Tất cả lớp ({classOptions.length})</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc trạng thái khoản thu"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value="ALL">Mọi trạng thái ({cashierData.receivables.length})</option>
                <option value="PAID">Đã thu đủ</option>
                <option value="PARTIAL">Thu một phần</option>
                <option value="UNPAID">Chưa thanh toán</option>
                <option value="NEEDS_RECONCILIATION">Cần đối soát</option>
                <option value="EXPIRED">Quá hạn giữ chỗ</option>
              </select>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyUnpaid}
                  onChange={(e) => setOnlyUnpaid(e.target.checked)}
                />
                Chỉ còn nợ
              </label>
              <input
                type="search"
                aria-label="Tìm khoản phải thu"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã khoản thu, học viên..."
                className="min-w-[200px] rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
              {(classFilter !== 'ALL' || stateFilter !== 'ALL' || onlyUnpaid || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setClassFilter('ALL');
                    setStateFilter('ALL');
                    setOnlyUnpaid(false);
                    setSearchQuery('');
                  }}
                  className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Đặt lại
                </button>
              )}
            </div>
          </div>

          {activeTab === 'debt' && debtByClass.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Bấm trực tiếp vào một thẻ lớp để lọc nhanh danh sách học viên thuộc lớp đó bên dưới
                (hoặc chọn trên thanh lọc lớp).
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {debtByClass.map((cls) => {
                  const selected = classFilter === cls.id;
                  const pct = cls.totalDue > 0 ? Math.min(100, Math.round((cls.totalPaid / cls.totalDue) * 100)) : 0;
                  const remaining = Math.max(0, cls.totalDue - cls.totalPaid);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => setClassFilter(selected ? 'ALL' : cls.id)}
                      className={`rounded-lg border p-3.5 text-left text-xs space-y-2 transition ${
                        selected
                          ? 'border-[#76a35e] bg-[#f4f9f1] ring-2 ring-[#76a35e]/30'
                          : 'border-slate-200 bg-slate-50/70 hover:border-[#76a35e] hover:bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-slate-900">
                          {cls.code} · {cls.name}
                        </p>
                        {selected && (
                          <span className="shrink-0 rounded-full bg-[#76a35e] px-2 py-0.5 text-[10px] font-bold text-white">
                            Đang lọc
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-[#76a35e]" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-slate-600">
                        Phải thu: <strong>{vnd(cls.totalDue)}</strong> · Đã thu:{' '}
                        <strong className="text-emerald-700">{vnd(cls.totalPaid)}</strong>
                      </p>
                      <p className="text-slate-600">
                        Còn lại:{' '}
                        <strong className={remaining > 0 ? 'text-rose-700' : 'text-slate-800'}>
                          {vnd(remaining)}
                        </strong>{' '}
                        · {cls.count} hồ sơ ({cls.unpaidCount} chưa thu đủ)
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredReceivables.length === 0 ? (
            <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              Không tìm thấy khoản phải thu nào khớp bộ lọc hiện tại.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Mã khoản thu</th>
                    <th className="py-2 pr-3">Học viên</th>
                    <th className="py-2 pr-3">Lớp</th>
                    <th className="py-2 pr-3">Phải thu</th>
                    <th className="py-2 pr-3">Đã thu</th>
                    <th className="py-2 pr-3">Còn lại</th>
                    <th className="py-2 pr-3">Trạng thái</th>
                    <th className="py-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceivables.map((r) => {
                    const remaining = Math.max(0, r.amountVnd - r.paidAmountVnd);
                    return (
                      <tr key={r.id}>
                        <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">
                          {r.receivableCode}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-900">{r.learner.fullName}</div>
                          <div className="text-slate-500">{r.learner.email}</div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-800">{r.classOffering.code}</div>
                          <div className="text-slate-500">
                            {cashierEnrollLabels[r.enrollment.status] ?? r.enrollment.status}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 font-semibold">{vnd(r.amountVnd)}</td>
                        <td className="py-2.5 pr-3 font-semibold text-emerald-700">
                          {vnd(r.paidAmountVnd)}
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-slate-700">
                          {vnd(remaining)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-semibold ${
                              r.status === 'PAID'
                                ? 'bg-emerald-100 text-emerald-900'
                                : r.status === 'EXPIRED'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {cashierStatusLabels[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedReceivable(r)}
                            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Xem chi tiết
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'receipts' && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#e66f2b]">
                Sổ phiếu thu &amp; chứng từ ({filteredReceipts.length})
              </h2>
              <p className="text-xs text-slate-600">
                Phiếu thu chỉ được phát hành tự động từ giao dịch SePay khớp chuẩn hoặc sau khi Thu
                ngân xác minh đối soát hợp lệ.
              </p>
            </div>
            {cashierData && (
              <div className="flex flex-wrap items-end gap-2">
                <select
                  aria-label="Lọc phiếu thu theo lớp"
                  value={receiptClassFilter}
                  onChange={(e) => setReceiptClassFilter(e.target.value)}
                  className="max-w-[210px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                >
                  <option value="ALL">Tất cả lớp ({classOptions.length})</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Lọc phương thức xác minh"
                  value={receiptMethodFilter}
                  onChange={(e) => setReceiptMethodFilter(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                >
                  <option value="ALL">Mọi phương thức</option>
                  <option value="SEPAY_AUTO_VERIFIED">Xác nhận tự động SePay</option>
                  <option value="CASHIER_MANUAL_VERIFIED">Thu ngân xác minh thủ công</option>
                </select>
                <label className="text-[11px] font-semibold text-slate-600">
                  Từ ngày
                  <input
                    type="date"
                    aria-label="Lọc phiếu thu từ ngày"
                    value={receiptFromDate}
                    onChange={(e) => setReceiptFromDate(e.target.value)}
                    className="ml-1.5 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-900"
                  />
                </label>
                <label className="text-[11px] font-semibold text-slate-600">
                  Đến ngày
                  <input
                    type="date"
                    aria-label="Lọc phiếu thu đến ngày"
                    value={receiptToDate}
                    onChange={(e) => setReceiptToDate(e.target.value)}
                    className="ml-1.5 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-normal text-slate-900"
                  />
                </label>
                <input
                  type="search"
                  aria-label="Tìm phiếu thu"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm số phiếu thu, email..."
                  className="min-w-[190px] rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                />
                {(receiptClassFilter !== 'ALL' ||
                  receiptMethodFilter !== 'ALL' ||
                  receiptFromDate ||
                  receiptToDate ||
                  searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptClassFilter('ALL');
                      setReceiptMethodFilter('ALL');
                      setReceiptFromDate('');
                      setReceiptToDate('');
                      setSearchQuery('');
                    }}
                    className="rounded border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Đặt lại
                  </button>
                )}
              </div>
            )}
          </div>
          {!filteredReceipts.length ? (
            <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              Chưa có phiếu thu nào khớp điều kiện trong phạm vi hiện hành.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Số phiếu thu</th>
                    <th className="py-2 pr-3">Học viên</th>
                    <th className="py-2 pr-3">Lớp</th>
                    <th className="py-2 pr-3">Số tiền</th>
                    <th className="py-2 pr-3">Phương thức xác minh</th>
                    <th className="py-2 pr-3">Ngày cấp</th>
                    <th className="py-2 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredReceipts.map((rc) => (
                    <tr key={rc.id}>
                      <td className="py-2.5 pr-3 font-mono font-bold text-slate-900">
                        {rc.receiptNumber}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-900">{rc.learner.fullName}</div>
                        <div className="text-slate-500">{rc.learner.email}</div>
                      </td>
                      <td className="py-2.5 pr-3">{rc.classOffering.code}</td>
                      <td className="py-2.5 pr-3 font-semibold text-emerald-700">
                        {vnd(rc.amountVnd)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {cashierVerifyLabels[rc.verificationMethod] ?? rc.verificationMethod}
                      </td>
                      <td className="py-2.5 pr-3">
                        {new Date(rc.issuedAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(rc)}
                            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Xem phiếu thu
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              printCashierReceiptDocument({
                                receiptNumber: rc.receiptNumber,
                                issuedAt: rc.issuedAt,
                                amountVnd: rc.amountVnd,
                                verificationMethod: rc.verificationMethod,
                                learnerName: rc.learner.fullName,
                                learnerEmail: rc.learner.email,
                                classCode: rc.classOffering.code,
                                className: rc.classOffering.name,
                                receivableCode: rc.receivable.receivableCode,
                                gateway: rc.transaction?.gateway ?? 'MB',
                                providerTransactionId:
                                  rc.transaction?.providerTransactionId ?? null,
                                cashierName: user?.fullName,
                              })
                            }
                            className="rounded border border-[#76a35e] bg-[#f4f9f1] px-2.5 py-1 text-xs font-semibold text-[#2f5d1e] hover:bg-[#76a35e] hover:text-white"
                          >
                            In nhanh
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'cases' && cashierData && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#e66f2b]">
                Giao dịch lệch chuẩn chờ xử lý ({pendingTxs.length})
              </h2>
              <p className="text-xs text-slate-600">
                Theo dõi giao dịch thiếu/dư/sai mã/quá hạn giữ chỗ cần xử lý và lịch sử đối soát đã
                thực hiện gần đây.
              </p>
            </div>
            <Link
              to="/payments/sepay"
              className="rounded bg-[#76a35e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5f8849]"
            >
              Mở trang Đối soát SePay →
            </Link>
          </div>
          {pendingTxs.length === 0 ? (
            <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              Hiện không có trường hợp ngoại lệ nào đang chờ Thu ngân xử lý.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingTxs.map((tx) => (
                <div
                  key={tx.id}
                  className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs space-y-1"
                >
                  <p className="font-bold text-slate-900">
                    Mã GD #{tx.providerTransactionId.slice(0, 8).toUpperCase()} ·{' '}
                    {vnd(tx.amountVnd)}
                  </p>
                  <p className="text-slate-700">
                    Nội dung: <span className="font-mono">{tx.content}</span> · Thời gian:{' '}
                    {new Date(tx.transactionDate).toLocaleString('vi-VN')}
                  </p>
                </div>
              ))}
            </div>
          )}

          {cashierData.reconciliationActions.length > 0 && (
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <h3 className="text-sm font-bold text-slate-900">
                Nhật ký xử lý đối soát gần đây ({cashierData.reconciliationActions.length})
              </h3>
              <div className="space-y-2">
                {cashierData.reconciliationActions.slice(0, 8).map((act) => (
                  <div
                    key={act.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {cashierActionLabels[act.action] ?? act.action}
                      </p>
                      {act.note && (
                        <p className="text-slate-600">{formatCashierActionNote(act.note)}</p>
                      )}
                    </div>
                    <span className="text-slate-500">
                      {new Date(act.createdAt).toLocaleString('vi-VN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {selectedReceivable && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết khoản phải thu"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-base font-bold text-slate-900">
                Chi tiết khoản phải thu · {selectedReceivable.receivableCode}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedReceivable(null)}
                className="rounded border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-2.5">
              <div>
                <dt className="text-slate-500">Học viên</dt>
                <dd className="font-semibold text-slate-900">
                  {selectedReceivable.learner.fullName} ({selectedReceivable.learner.email})
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Lớp học</dt>
                <dd className="font-semibold text-slate-900">
                  {selectedReceivable.classOffering.code} · {selectedReceivable.classOffering.name}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Số tiền phải thu</dt>
                <dd className="font-bold text-slate-900">{vnd(selectedReceivable.amountVnd)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Đã thu / Trạng thái</dt>
                <dd className="font-bold text-emerald-700">
                  {vnd(selectedReceivable.paidAmountVnd)} ·{' '}
                  {cashierStatusLabels[selectedReceivable.status] ?? selectedReceivable.status}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Mã thanh toán gần nhất</dt>
                <dd className="font-mono text-slate-900">
                  {selectedReceivable.paymentOrders[0]?.paymentCode ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Số phiếu thu</dt>
                <dd className="font-mono font-semibold text-[#2f5d1e]">
                  {selectedReceivable.receipt?.receiptNumber ?? 'Chưa phát hành'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {selectedReceipt && (() => {
        const dp = formatReceiptDayParts(selectedReceipt.issuedAt);
        return (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết phiếu thu"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-700">
                Xem trước chứng từ phiếu thu (Mẫu in A5 ngang)
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    printCashierReceiptDocument({
                      receiptNumber: selectedReceipt.receiptNumber,
                      issuedAt: selectedReceipt.issuedAt,
                      amountVnd: selectedReceipt.amountVnd,
                      verificationMethod: selectedReceipt.verificationMethod,
                      learnerName: selectedReceipt.learner.fullName,
                      learnerEmail: selectedReceipt.learner.email,
                      classCode: selectedReceipt.classOffering.code,
                      className: selectedReceipt.classOffering.name,
                      receivableCode: selectedReceipt.receivable.receivableCode,
                      gateway: selectedReceipt.transaction?.gateway ?? 'MB',
                      providerTransactionId:
                        selectedReceipt.transaction?.providerTransactionId ?? null,
                      cashierName: user?.fullName,
                    })
                  }
                  className="whitespace-nowrap rounded bg-[#76a35e] px-3.5 py-1.5 font-semibold text-white hover:bg-[#5f8849]"
                >
                  In phiếu thu
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  className="whitespace-nowrap rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>

            <div className="rounded-md border-2 border-[#2f5d1e] bg-white p-1.5 shadow-sm">
              <div className="rounded border border-slate-400 p-5 space-y-3">
                <div className="flex items-start justify-between gap-4 border-b border-slate-300 pb-2.5">
                  <div>
                    <p className="text-sm font-bold uppercase text-[#2f5d1e]">
                      TRUNG TÂM ANH NGỮ SMART ENGLISH
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Bộ phận Tài chính &amp; Thu học phí · Hệ thống Smart English LMS
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-700">
                    <p className="font-bold text-slate-900">Mẫu số: 01-TT</p>
                    <p>
                      Số phiếu: <strong className="font-mono text-slate-900">{selectedReceipt.receiptNumber}</strong>
                    </p>
                    <p>
                      Mã khoản thu: <strong className="font-mono text-slate-900">{selectedReceipt.receivable.receivableCode}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <h3 className="text-lg font-extrabold uppercase tracking-wide text-[#e66f2b]">
                    PHIẾU THU HỌC PHÍ
                  </h3>
                  <p className="italic text-slate-600">
                    Ngày {dp.day} tháng {dp.month} năm {dp.year}
                  </p>
                  <span className="inline-block rounded-full border border-[#b9d4ab] bg-[#f4f9f1] px-2.5 py-0.5 text-[10px] font-bold text-[#2f5d1e]">
                    Chứng từ hợp lệ · Giao học viên &amp; lưu đối soát
                  </span>
                </div>

                <table className="w-full border-collapse text-xs">
                  <tbody className="divide-y divide-dotted divide-slate-300">
                    <tr>
                      <td className="w-44 py-1.5 font-semibold text-slate-600">Họ và tên người nộp tiền:</td>
                      <td className="py-1.5 text-slate-900">
                        <strong>{selectedReceipt.learner.fullName}</strong> · Email:{' '}
                        {selectedReceipt.learner.email}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-semibold text-slate-600">Lớp học đăng ký:</td>
                      <td className="py-1.5 text-slate-900">
                        <strong>{selectedReceipt.classOffering.code}</strong> —{' '}
                        {selectedReceipt.classOffering.name}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-semibold text-slate-600">Lý do nộp tiền:</td>
                      <td className="py-1.5 text-slate-900">
                        Thu học phí lớp {selectedReceipt.classOffering.code} theo khoản phải thu{' '}
                        <span className="font-mono">{selectedReceipt.receivable.receivableCode}</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-semibold text-slate-600">Số tiền thực thu:</td>
                      <td className="py-1.5">
                        <span className="inline-block rounded border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-sm font-extrabold text-emerald-800">
                          {vnd(selectedReceipt.amountVnd)}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-semibold text-slate-600">Viết bằng chữ:</td>
                      <td className="py-1.5 italic text-slate-800">
                        {numberToVietnameseWords(selectedReceipt.amountVnd)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-semibold text-slate-600">Kèm theo / Kênh xác nhận:</td>
                      <td className="py-1.5 text-slate-900">
                        {cashierVerifyLabels[selectedReceipt.verificationMethod] ??
                          selectedReceipt.verificationMethod}
                        {selectedReceipt.transaction?.providerTransactionId
                          ? ` · Ngân hàng ${selectedReceipt.transaction.gateway ?? 'MB'} · Mã GD #${selectedReceipt.transaction.providerTransactionId.slice(0, 10).toUpperCase()}`
                          : ''}{' '}
                        · {new Date(selectedReceipt.issuedAt).toLocaleString('vi-VN')} (GMT+7)
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="grid grid-cols-3 gap-4 pt-2 text-center text-[11px]">
                  <div>
                    <p className="font-bold uppercase text-slate-900">Người nộp tiền</p>
                    <p className="italic text-slate-500">(Ký, ghi rõ họ tên)</p>
                    <p className="mt-8 font-semibold text-slate-900">
                      {selectedReceipt.learner.fullName}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold uppercase text-slate-900">Thu ngân lập phiếu</p>
                    <p className="italic text-slate-500">(Ký, ghi rõ họ tên)</p>
                    <p className="mt-8 font-semibold text-slate-900">
                      {user?.fullName ?? 'Thu ngân Smart English'}
                    </p>
                  </div>
                  <div>
                    <p className="font-bold uppercase text-slate-900">Kế toán trưởng</p>
                    <p className="italic text-slate-500">(Ký, đóng dấu xác nhận)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

export function AdmissionsWorkspacePage() {
  const { user } = useAuth();
  if (user?.role === 'CASHIER') {
    return <CashierAdmissionsContent key={`${user.id}:${user.role}`} />;
  }
  return <AdmissionsWorkspaceContent key={`${user?.id}:${user?.role}`} />;
}

function AdmissionsWorkspaceContent() {
  const { user } = useAuth(),
    location = useLocation(),
    navigate = useNavigate(),
    [data, setData] = useState<ApplicationRow[]>(),
    [classes, setClasses] = useState<StaffClass[]>(),
    [stateFilter, setStateFilter] = useState('ALL'),
    [searchQuery, setSearchQuery] = useState(''),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0),
    c = useCommand();

  const isCashier = user?.role === 'CASHIER';
  const activeTab: CashierTab =
    location.hash === '#receipts'
      ? 'receipts'
      : location.hash === '#debt'
        ? 'debt'
        : location.hash === '#cases'
          ? 'cases'
          : 'obligations';

  useEffect(() => {
    let live = true;
    void Promise.all([
      readAdmission<{ data: ApplicationRow[] }>('workspace'),
      readAdmission<{ data: StaffClass[] }>('staff/classes'),
    ])
      .then(([a, b]) => {
        if (live) {
          setData(a.data);
          setClasses(b.data);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setClasses(undefined);
          setError('Bạn chưa có quyền mở trang này hoặc quyền đã hết hiệu lực.');
        }
      });
    return () => {
      live = false;
    };
  }, [tick]);

  const filteredApps = (data ?? []).filter((x) => {
    if (stateFilter !== 'ALL' && x.state !== stateFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      x.class.code.toLowerCase().includes(q) ||
      x.class.name.toLowerCase().includes(q) ||
      (x.learner?.fullName ?? '').toLowerCase().includes(q) ||
      x.id.toLowerCase().includes(q)
    );
  });

  const switchCashierTab = (tab: CashierTab) => {
    setSearchQuery('');
    setStateFilter('ALL');
    const hash = tab === 'obligations' ? '' : '#' + tab;
    navigate('/workspace/admissions' + hash, { replace: true });
  };

  return (
    <main className="workspace-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <Link
          to="/workspace"
          className="font-semibold text-[#2f5d1e] hover:text-[#e66f2b] hover:underline"
        >
          {isCashier ? '← Tổng quan thu ngân' : '← Tổng quan học vụ'}
        </Link>
        <Link
          to={isCashier ? '/payments/sepay' : '/academic'}
          className="font-semibold text-slate-600 hover:text-[#e66f2b] hover:underline"
        >
          {isCashier ? 'Đối soát cổng SePay →' : 'Chương trình & Lớp →'}
        </Link>
      </div>
      <header className="rounded-lg border border-slate-200 bg-white p-5">
        <span className="inline-flex items-center rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
          {isCashier ? 'Không gian Thu ngân · Nhập học & Học phí' : 'Không gian Học vụ · Xét duyệt nhập học'}
        </span>
        <h1 className="mt-1.5 text-2xl font-bold text-[#e66f2b] sm:text-3xl">
          {isCashier ? 'Quản lý khoản phải thu, phiếu thu & công nợ' : 'Xét duyệt nhập học'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isCashier
            ? 'Theo dõi khoản phải thu học phí, đối chiếu chứng từ biên nhận, công nợ học viên và các trường hợp cần xử lý theo đúng phạm vi được cấp.'
            : 'Kiểm tra hồ sơ ghi danh, xác nhận mở lớp tiếp nhận và xét duyệt nhập học theo quyền được cấp.'}
        </p>
      </header>
      <TestBanner />

      {isCashier && (
        <nav
          aria-label="Khu vực nghiệp vụ thu ngân"
          className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"
        >
          {(
            [
              ['obligations', 'Khoản phải thu'],
              ['receipts', 'Phiếu thu & Chứng từ'],
              ['debt', 'Công nợ & Biểu phí lớp'],
              ['cases', 'Trường hợp cần xử lý'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchCashierTab(key)}
              className={`rounded px-3.5 py-2 text-xs font-semibold transition ${
                activeTab === key
                  ? 'bg-[#76a35e] text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}
      {error && (user?.role === 'ACADEMIC_MANAGER' || isCashier) && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
          <h2 className="font-bold">Cần xác thực danh tính nội bộ để thao tác nhập học &amp; tài chính</h2>
          <p className="text-xs leading-relaxed">
            Phân hệ hồ sơ nhập học và thu chi chỉ mở thao tác ghi nhận trực tiếp cho tài khoản nghiệp vụ nội bộ được cấp quyền hợp lệ. Tài khoản{' '}
            <strong>{user.email}</strong>{' '}
            {isCashier
              ? 'hiện chưa thuộc danh sách danh tính thu ngân được kích hoạt cho phiên này; hệ thống giữ nguyên cơ chế bảo vệ và không hiển thị số dư hay tự tạo phiếu thu.'
              : 'hiện chưa thuộc danh sách danh tính xét duyệt nhập học được kích hoạt cho phiên này; bạn vẫn có thể xem các lớp thuộc phạm vi và điều phối tại mục Lớp trong phạm vi được cấp.'}
          </p>
        </section>
      )}
      {user?.role === 'ACADEMIC_MANAGER' && (
        <section className="workspace-card space-y-3">
          <h2 className="text-xl font-bold text-slate-950">Lớp trong phạm vi được cấp</h2>
          {classes?.map((x) => (
            <article key={x.id} className="workspace-subcard bg-white space-y-2">
              <p className="font-semibold text-slate-900">
                {classLabel(x.name, x.code)} · <span className="badge-info">{x.status}</span> ·{' '}
                {vnd(x.approvedTuitionFeeVnd)}
              </p>
              <SourceRecord name={x.name} code={x.code} />
              {x.w07ClassControlClass.length ? (
                <p className="text-xs font-medium text-emerald-700">
                  Đã bật tiếp nhận hồ sơ chính thức, không giữ chỗ.
                </p>
              ) : (
                <form
                  className="mt-3 flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void c
                      .send('classes/' + x.id + '/enable', { reason: d.get('reason') })
                      .then((r) => {
                        if (r) setTick((t) => t + 1);
                      });
                  }}
                >
                  <label className="block flex-1 text-xs font-semibold text-slate-700">
                    Lý do mở tiếp nhận
                    <input required maxLength={1000} className={field} name="reason" />
                  </label>
                  <button disabled={c.busy || x.status !== 'OPEN'} className={button}>
                    Mở tiếp nhận hồ sơ
                  </button>
                </form>
              )}
            </article>
          ))}
        </section>
      )}
      <Feedback command={c} />

      {isCashier && activeTab === 'receipts' && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-lg font-bold text-[#e66f2b]">Phiếu thu & Chứng từ đã ghi nhận</h2>
          <p className="text-xs text-slate-600">
            Thu ngân chỉ xác minh chứng từ và ghi nhận biên nhận từ hồ sơ có chứng từ/giao dịch hợp
            lệ; không tạo phiếu thu khống khi chưa có giao dịch SePay hoặc bằng chứng tải lên.
          </p>
          {!data?.length ? (
            <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              Chưa có hồ sơ/chứng từ nào khả dụng trong phạm vi quyền hiện hành để xuất danh sách
              phiếu thu.
            </p>
          ) : (
            <div className="space-y-2.5">
              {filteredApps.map((x) => (
                <Link
                  key={x.id}
                  to={'/admissions/' + x.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs hover:border-[#76a35e] hover:bg-white"
                >
                  <span>
                    <strong>{accountLabel(x.learner?.fullName ?? '')}</strong> ·{' '}
                    {classLabel(x.class.name, x.class.code)}
                  </span>
                  <span className="font-semibold text-[#2f5d1e]">
                    {vnd(x.amountVnd)} · Mở đối soát chứng từ →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {isCashier && activeTab === 'debt' && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-lg font-bold text-[#e66f2b]">
            Công nợ học viên & Biểu phí lớp đã duyệt
          </h2>
          <p className="text-xs text-slate-600">
            Mức học phí làm căn cứ công nợ phải khớp đúng biểu phí đã duyệt theo lớp. Thanh toán
            một phần giữ nguyên trạng thái chưa hoàn tất nghĩa vụ và không kích hoạt lớp.
          </p>
          {classes && classes.length > 0 ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className="rounded border border-slate-200 bg-slate-50 p-3 text-xs space-y-1"
                >
                  <p className="font-bold text-slate-900">{classLabel(cls.name, cls.code)}</p>
                  <p className="text-slate-600">
                    Trạng thái lớp: <strong>{cls.status}</strong> · Học phí chuẩn:{' '}
                    <strong>{vnd(cls.approvedTuitionFeeVnd)}</strong>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              Chưa đọc được danh sách biểu phí lớp trong phạm vi hiện hành.
            </p>
          )}
        </section>
      )}

      {isCashier && activeTab === 'cases' && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-lg font-bold text-[#e66f2b]">
            Các trường hợp cần xử lý & Điều chỉnh công nợ
          </h2>
          <p className="text-xs text-slate-600">
            Theo dõi các hồ sơ tạm giữ xem xét, thanh toán thừa, đề nghị đảo/hoàn phí (theo cơ chế
            maker-checker) hoặc cần đối soát lại qua SePay.
          </p>
          <div className="space-y-2">
            {filteredApps
              .filter((x) => ['BLOCKED_REVIEW', 'SUBMITTED'].includes(x.state) || !!x.blockReason)
              .map((x) => (
                <Link
                  key={x.id}
                  to={'/admissions/' + x.id}
                  className="block rounded border border-amber-200 bg-amber-50/70 p-3 text-xs hover:border-amber-400"
                >
                  <p className="font-bold text-slate-900">
                    {classLabel(x.class.name, x.class.code)} ·{' '}
                    {accountLabel(x.learner?.fullName ?? '')}
                  </p>
                  <p className="text-slate-700">
                    {admissionLabel(x.state)} · {vnd(x.amountVnd)}
                    {x.blockReason ? ` · Ghi chú: ${x.blockReason}` : ''}
                  </p>
                </Link>
              ))}
            {filteredApps.filter(
              (x) => ['BLOCKED_REVIEW', 'SUBMITTED'].includes(x.state) || !!x.blockReason,
            ).length === 0 && (
              <p className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
                Không có trường hợp ngoại lệ W07 nào đang hiển thị trong phạm vi hiện hành. Kiểm
                tra thêm ngoại lệ giao dịch tại mục{' '}
                <Link to="/payments/sepay" className="font-semibold text-[#2f5d1e] underline">
                  Đối soát SePay
                </Link>
                .
              </p>
            )}
          </div>
        </section>
      )}

      {(!isCashier || activeTab === 'obligations' || activeTab === 'debt') && (
        <section className="workspace-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-[#e66f2b]">
              {isCashier ? 'Danh sách khoản phải thu trong phạm vi' : 'Hồ sơ được phép xem'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {isCashier && (
                <input
                  type="search"
                  aria-label="Tìm khoản phải thu"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm học viên, mã lớp..."
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900"
                />
              )}
              {data && data.length > 0 && (
                <select
                  aria-label="Lọc trạng thái hồ sơ"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                >
                  <option value="ALL">Tất cả ({data.length})</option>
                  <option value="SUBMITTED">Chờ duyệt học vụ</option>
                  <option value="BLOCKED_REVIEW">Tạm giữ xem xét</option>
                  <option value="APPROVED">Đã duyệt</option>
                  <option value="REJECTED">Từ chối</option>
                </select>
              )}
            </div>
          </div>
          {filteredApps.map((x) => (
            <Link
              key={x.id}
              className="workspace-subcard block bg-white transition hover:border-[#76a35e]"
              to={'/admissions/' + x.id}
            >
              <span className="font-semibold text-slate-900">
                {classLabel(x.class.name, x.class.code)}
              </span>{' '}
              · {accountLabel(x.learner?.fullName ?? '')} ·{' '}
              <span className="badge-info">{admissionLabel(x.state)}</span> ·{' '}
              <strong className="text-indigo-950">{vnd(x.amountVnd)}</strong>
            </Link>
          ))}
          {data?.length === 0 && (
            <p className="text-sm text-slate-600">
              Không có hồ sơ trong phạm vi hiện hành. Cần quyền theo đúng lớp, còn hiệu lực.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
export function AdmissionDetailPage() {
  const { user } = useAuth();
  const { id = '' } = useParams();
  if (user?.role === 'STUDENT') return <StudentFinancePage id={id} />;
  return <AdmissionDetail key={`${user?.id}:${user?.role}:${id}`} id={id} />;
}
function AdmissionDetail({ id }: { id: string }) {
  const { user } = useAuth(),
    [data, setData] = useState<Detail>(),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0),
    c = useCommand(),
    [offers, setOffers] = useState<Offer[]>([]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  useEffect(() => {
    let live = true;
    void readAdmission<Detail>('applications/' + id)
      .then((r) => {
        if (live) {
          setData(r);
          setError('');
        }
      })
      .catch(() => {
        if (live) {
          setData(undefined);
          setError('Hồ sơ không còn trong quyền hoặc phiên hiện hành.');
        }
      });
    return () => {
      live = false;
    };
  }, [id, tick]);
  useEffect(() => {
    if (user?.role === 'STUDENT')
      void readAdmission<{ data: Offer[] }>('offers')
        .then((r) => setOffers(r.data))
        .catch(() => {});
  }, [user?.role]);
  async function submit(
    e: FormEvent<HTMLFormElement>,
    path: string,
    body: (d: FormData) => Record<string, unknown>,
  ) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    if (await c.send(path, body(d))) reload();
  }
  return (
    <main className="workspace-page">
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2f5d1e] hover:text-[#e66f2b] hover:underline"
          to={user?.role === 'STUDENT' ? '/admissions' : '/workspace/admissions'}
        >
          {user?.role === 'CASHIER' ? '← Danh sách khoản phải thu' : '← Danh sách hồ sơ'}
        </Link>
      </div>
      <header className="rounded-lg border border-slate-200 bg-white p-5">
        <span className="inline-flex items-center rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
          Chi tiết hồ sơ & nghĩa vụ học phí
        </span>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#e66f2b] sm:text-3xl">
          Hồ sơ nhập học / học phí
        </h1>
      </header>
      <TestBanner />
      {error && (
        <div className="space-y-3">
          <p role="alert" className="state-error text-sm font-medium">
            {error}
          </p>
          {user?.role === 'CASHIER' && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
              Cổng W07 chỉ cấp quyền đọc/xác minh chi tiết cho danh tính thử nghiệm hợp lệ và grant{' '}
              <code className="font-mono">finance.verify</code> theo lớp còn hiệu lực. Hệ thống
              không tự tạo phiếu thu hoặc thay đổi nghĩa vụ công nợ khi bị từ chối quyền.
            </div>
          )}
        </div>
      )}
      {!data && !error && (
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang tải trạng thái đã lưu…
        </p>
      )}
      {data && (
        <>
          <section className="workspace-card space-y-2.5">
            <h2 className="text-xl font-bold text-slate-950">
              {classLabel(data.class.name, data.class.code)}
            </h2>
            <SourceRecord name={data.class.name} code={data.class.code} />
            <p className="text-sm text-slate-700">
              Học viên: <strong>{accountLabel(data.learner.fullName)}</strong>
            </p>
            <p data-testid="admission-state" className="text-sm font-semibold text-indigo-950">
              {admissionLabel(data.application.state)} · Hồ sơ v{data.application.number}, quyết
              định v{data.application.lockVersion}
            </p>
            <p className="text-sm text-slate-700">
              Chương trình:{' '}
              {data.application.termsTitle
                ? isTechnicalQaRecord(data.application.termsTitle)
                  ? 'Điều khoản chương trình đã duyệt'
                  : data.application.termsTitle
                : 'Nguồn phiên bản chưa rõ'}{' '}
              · phiên bản {data.application.versionNumber ?? 'UNKNOWN'} · Học phí đã ghi nhận:{' '}
              <strong>{vnd(data.application.amountVnd)}</strong>
            </p>
            {data.application.blockReason && (
              <p role="note" className="text-sm font-medium text-amber-800">
                Chưa thể duyệt: {data.application.blockReason}
              </p>
            )}
            <p className="text-xs text-slate-500">
              {data.application.referralId
                ? 'Có nguồn tư vấn đã xác minh; không phải quyết định nhập học.'
                : 'Nguồn: hồ sơ trực tiếp.'}
            </p>
            <div>
              <button className={button} onClick={reload}>
                Tải trạng thái đã lưu
              </button>
            </div>
          </section>
          <Feedback command={c} />
          {data.permissions.academic &&
            ['SUBMITTED', 'BLOCKED_REVIEW'].includes(data.application.state) && (
              <form
                className="space-y-3 rounded-xl border p-5"
                onSubmit={(e) =>
                  void submit(e, 'applications/' + id + '/academic-decisions', (d) => ({
                    decision: d.get('decision'),
                    reason: d.get('reason'),
                    expectedVersion: data.application.lockVersion,
                  }))
                }
              >
                <h2 className="text-xl font-bold">Học vụ xét duyệt độc lập</h2>
                <label className="block">
                  Quyết định học vụ
                  <select name="decision" className={field}>
                    {data.application.state === 'SUBMITTED' && (
                      <option value="APPROVE">Duyệt học vụ — không giữ chỗ</option>
                    )}
                    <option value="REJECT">Từ chối với lý do</option>
                  </select>
                </label>
                <label className="block">
                  Lý do học vụ
                  <textarea name="reason" required maxLength={1000} className={field} />
                </label>
                <button disabled={c.busy} className={button}>
                  Lưu quyết định học vụ
                </button>
              </form>
            )}
          {data.obligation && (
            <section className="space-y-3 rounded-xl border p-5">
              <h2 className="text-xl font-bold">
                {data.synthetic ? 'Học phí và công nợ' : 'Học phí theo giá đã duyệt'}
              </h2>
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt>Khoản phải thu đã chốt</dt>
                  <dd>{vnd(data.obligation.dueVnd)}</dd>
                </div>
                <div>
                  <dt>{data.synthetic ? 'Đã phân bổ' : 'Đã phân bổ'}</dt>
                  <dd data-testid="allocated-money">{vnd(data.obligation.paidVnd)}</dd>
                </div>
                <div>
                  <dt>Còn lại</dt>
                  <dd>{vnd(data.obligation.remainingVnd)}</dd>
                </div>
              </dl>
              <p data-testid="finance-state">{admissionLabel(data.obligation.state)}</p>
              <p>
                Khoản thừa chờ xem xét: {vnd(data.obligation.creditPendingVnd)}. Không tự hoàn hoặc
                dùng để cấp quyền.
              </p>
              <p>
                Hạn thanh toán:{' '}
                {data.obligation.dueAt ?? 'Chưa có hạn được duyệt; không tự phạt hoặc hết hạn.'}
              </p>
              {data.synthetic &&
                data.permissions.own &&
                data.application.state === 'APPROVED' &&
                !data.entitlements.some((x) => x.outcome === 'ACTIVE') && (
                  <UploadProof
                    feeId={data.obligation.id}
                    defaultAmount={data.obligation.remainingVnd}
                    reload={reload}
                  />
                )}
            </section>
          )}
          {!data.synthetic && data.obligation && (
            <section className="workspace-card space-y-3">
              <p className="text-sm text-slate-700">
                Nghĩa vụ học phí theo biểu giá đã duyệt; chưa có xác nhận tiền vào. Mã thanh toán
                được tạo riêng bằng tài khoản nhận SePay đã xác minh.
              </p>
              <div>
                <Link className={button} to="/payments/sepay">
                  Xem đơn và VietQR SePay
                </Link>
              </div>
              {data.permissions.verify && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void c
                      .send('applications/' + id + '/payment-source', {
                        reason: String(d.get('reason')),
                      })
                      .then(reload);
                  }}
                >
                  <label>
                    Lý do xác nhận nguồn học phí
                    <input
                      className={field}
                      name="reason"
                      required
                      minLength={10}
                      maxLength={500}
                    />
                  </label>
                  <button className={button} disabled={c.busy}>
                    Cho phép tạo chỉ dẫn thanh toán
                  </button>
                  <Feedback command={c} />
                </form>
              )}
            </section>
          )}
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Chứng từ và biên nhận</h2>
            {!data.evidence.length && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-600">
                <p className="font-semibold text-slate-900">Chưa có chứng từ được gửi</p>
                <p>
                  Hồ sơ đang chờ thanh toán. Chứng từ và kết quả đối soát sẽ xuất hiện tại đây sau
                  khi được gửi đúng quy trình.
                </p>
              </div>
            )}
            {data.evidence.map((e) => (
              <article key={e.id} className="space-y-3 rounded-xl border p-5">
                <p className="break-all text-xs text-slate-600">Mã biên nhận chứng từ: {e.id}</p>
                <p>
                  {vnd(e.amountVnd)} · {admissionLabel(e.status)} ·{' '}
                  {e.sourceRef ?? 'Tham chiếu chỉ dành cho quyền tài chính'}
                </p>
                <p className="break-all text-xs">{e.sha256 && 'SHA-256: ' + e.sha256}</p>
                {e.downloadable && (
                  <a
                    className={button}
                    href={apiUrl(admissionsBase + 'evidence/' + e.id + '/file')}
                  >
                    Xem chứng từ riêng tư
                  </a>
                )}
                {data.permissions.verify && e.status === 'PENDING_REVIEW' && (
                  <form
                    className="space-y-3"
                    onSubmit={(ev) =>
                      void submit(ev, 'evidence/' + e.id + '/review', (d) => ({
                        decision: d.get('decision'),
                        reason: d.get('reason'),
                      }))
                    }
                  >
                    <label className="block">
                      Quyết định đối soát
                      <select className={field} name="decision">
                        <option value="VERIFY">Xác minh minh họa (không ghi nhận tiền thật)</option>
                        <option value="REJECT">Từ chối bằng chứng</option>
                      </select>
                    </label>
                    <label className="block">
                      Lý do đối soát
                      <textarea required name="reason" maxLength={1000} className={field} />
                    </label>
                    <button disabled={c.busy} className={button}>
                      Lưu đối soát minh họa
                    </button>
                  </form>
                )}
              </article>
            ))}
          </section>
          {data.permissions.own && (
            <section className="space-y-3 rounded-xl border p-5">
              <h2 className="text-xl font-bold">Quyền học có kiểm chứng</h2>
              <p>
                Cần duyệt học vụ còn hiệu lực, đủ phân bổ được xác minh, không có khoản thừa/pending
                cần xử lý và còn sĩ số. Thanh toán một phần không mở LMS.
              </p>
              <button
                disabled={c.busy}
                className={button}
                onClick={() =>
                  void c.send('applications/' + id + '/activate', {}).then((r) => {
                    if (r) reload();
                  })
                }
              >
                Kiểm tra và cấp quyền học
              </button>
              {data.entitlements.map((x) => (
                <p key={x.id} data-testid="entitlement-receipt">
                  {admissionLabel(x.outcome)} · {x.reasonCode}
                </p>
              ))}
              {data.entitlements.some((x) => x.outcome === 'ACTIVE') && (
                <Link className={button} to={'/classroom/' + data.class.id}>
                  Vào lớp đã được cấp quyền
                </Link>
              )}
            </section>
          )}
          {data.permissions.finance && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold">Lịch sử thu và phân bổ học phí</h2>
              {!data.events.length && (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-600">
                  Chưa phát sinh khoản thu hoặc phân bổ cho hồ sơ này. Công nợ vẫn được giữ nguyên
                  cho đến khi có giao dịch hợp lệ.
                </p>
              )}
              {data.events.map((e) => (
                <article className="space-y-2 rounded-xl border p-4" key={e.id}>
                  <p>
                    {admissionLabel(e.kind)} · {vnd(e.amountVnd)} · {e.reason}
                  </p>
                  {data.permissions.proposeAdjustment && e.kind === 'VERIFY' && (
                    <AdjustmentForm eventId={e.id} amount={e.amountVnd} reload={reload} />
                  )}
                </article>
              ))}
            </section>
          )}
          {data.adjustments.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold">Đề nghị tài chính — không chi trả thực</h2>
              {data.adjustments.map((r) => (
                <article key={r.id} className="space-y-3 rounded-xl border p-4">
                  <p>
                    {admissionLabel(r.kind)} · {vnd(r.amountVnd)} · {admissionLabel(r.state)}
                  </p>
                  <p>
                    {r.reason} · Bằng chứng: {r.evidence}
                  </p>
                  {r.blockReason && (
                    <p>Cần chính sách: {r.blockReason}. Chưa duyệt chi trả/thu hồi quyền.</p>
                  )}
                  {data.permissions.checkAdjustment && r.makerId !== user?.id && !r.decision && (
                    <form
                      className="space-y-3"
                      onSubmit={(e) =>
                        void submit(e, 'adjustments/' + r.id + '/decision', (d) => ({
                          decision: d.get('decision'),
                          reason: d.get('reason'),
                        }))
                      }
                    >
                      <label className="block">
                        Quyết định kiểm tra độc lập
                        <select className={field} name="decision">
                          {r.state === 'PENDING_REVIEW' && (
                            <option value="APPROVE">
                              Duyệt bút toán đảo minh họa trước cấp quyền
                            </option>
                          )}
                          <option value="REJECT">Từ chối</option>
                        </select>
                      </label>
                      <label className="block">
                        Lý do kiểm tra
                        <textarea required name="reason" maxLength={1000} className={field} />
                      </label>
                      <button disabled={c.busy} className={button}>
                        Lưu kiểm tra độc lập
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </section>
          )}
          {data.permissions.own && (
            <form
              className="space-y-3 rounded-xl border p-5"
              onSubmit={(e) =>
                void submit(e, 'applications/' + id + '/cases', (d) => ({
                  kind: d.get('kind'),
                  reason: d.get('reason'),
                  ...(d.get('targetClassId') ? { targetClassId: d.get('targetClassId') } : {}),
                }))
              }
            >
              <h2 className="text-xl font-bold">Yêu cầu rút / chuyển</h2>
              <p>
                Không tự hoàn tiền, chuyển giá hoặc xóa lịch sử. Khi thiếu chính sách hiệu lực
                quyền/hoàn phí, yêu cầu cần xem xét.
              </p>
              <label className="block">
                Loại yêu cầu
                <select className={field} name="kind">
                  <option value="WITHDRAW">Rút hồ sơ</option>
                  <option value="TRANSFER">Đề nghị chuyển lớp</option>
                </select>
              </label>
              <label className="block">
                Lớp đích (chỉ khi đề nghị chuyển)
                <select className={field} name="targetClassId">
                  <option value="">Không chuyển lớp</option>
                  {offers
                    .filter((x) => x.id !== data.class.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.code} · {x.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                Lý do yêu cầu
                <textarea className={field} name="reason" required maxLength={1000} />
              </label>
              <button className={button} disabled={c.busy}>
                Gửi yêu cầu xem xét
              </button>
            </form>
          )}
          {data.cases.map((r) => (
            <article key={r.id} className="space-y-3 rounded-xl border p-4">
              <p>
                {admissionLabel(r.kind)} · {admissionLabel(r.state)} · {r.reason}
              </p>
              {r.blockReason && <p>{r.blockReason}</p>}
              {data.permissions.academic &&
                r.kind === 'WITHDRAW' &&
                r.state === 'PENDING_REVIEW' &&
                ['SUBMITTED', 'APPROVED'].includes(data.application.state) && (
                  <form
                    className="space-y-3"
                    onSubmit={(e) =>
                      void submit(e, 'applications/' + id + '/academic-decisions', (d) => ({
                        decision: 'CANCEL',
                        reason: d.get('reason'),
                        expectedVersion: data.application.lockVersion,
                        caseId: r.id,
                      }))
                    }
                  >
                    <label className="block">
                      Lý do hủy học vụ
                      <textarea name="reason" className={field} required maxLength={1000} />
                    </label>
                    <button disabled={c.busy} className={button}>
                      Hủy hồ sơ trước cấp quyền — không hoàn tiền
                    </button>
                  </form>
                )}
            </article>
          ))}
          <details>
            <summary>Lịch sử quyết định học vụ</summary>
            {data.decisions.map((x) => (
              <p key={x.id}>
                {admissionLabel(x.kind)} · v{x.number} · {x.reason}
              </p>
            ))}
          </details>
        </>
      )}
    </main>
  );
}
function UploadProof({
  feeId,
  defaultAmount,
  reload,
}: {
  feeId: string;
  defaultAmount: number;
  reload: () => void;
}) {
  const c = useCommand();
  return (
    <form
      className="space-y-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget),
          file = d.get('file');
        if (file instanceof File)
          void c
            .send(
              'obligations/' + feeId + '/evidence',
              { amountVnd: d.get('amountVnd'), sourceRef: d.get('sourceRef'), synthetic: 'true' },
              file,
            )
            .then((r) => {
              if (r) reload();
            });
      }}
    >
      <h3 className="font-bold">Gửi chứng từ minh họa</h3>
      <p className="text-sm text-slate-600">
        Nếu mất phản hồi hoặc tải lại trang, chọn lại đúng file và thông tin cũ để đối chiếu biên
        nhận bằng cùng khóa retry. File không được lưu trong trình duyệt; chứng từ không xác nhận đã
        nhận tiền.
      </p>
      <label className="block">
        Số tiền minh họa (VND)
        <input
          name="amountVnd"
          required
          type="number"
          min="1"
          max="2147483647"
          step="1"
          defaultValue={defaultAmount > 0 ? defaultAmount : undefined}
          className={field}
        />
      </label>
      <label className="block">
        Mã tham chiếu chứng từ
        <input
          name="sourceRef"
          required
          pattern="TEST-[A-Z0-9_-]{6,70}"
          maxLength={75}
          placeholder="TEST-PHIEU001"
          className={field}
        />
      </label>
      <label className="block">
        Tệp chứng từ minh họa (PNG/JPEG/PDF, tối đa 5 MB)
        <input
          name="file"
          type="file"
          required
          accept="image/png,image/jpeg,application/pdf"
          className={field}
        />
      </label>
      <label className="flex gap-3">
        <input type="checkbox" required />
        Tôi xác nhận đây là chứng từ minh họa, không chứa thông tin ngân hàng hoặc học viên thật.
      </label>
      <button disabled={c.busy} className={button}>
        Gửi chứng từ — chờ xác minh
      </button>
      <Feedback command={c} />
    </form>
  );
}
function AdjustmentForm({
  eventId,
  amount,
  reload,
}: {
  eventId: string;
  amount: number;
  reload: () => void;
}) {
  const c = useCommand();
  return (
    <details>
      <summary>Đề nghị đảo / điều chỉnh / hoàn (không chi trả)</summary>
      <form
        className="space-y-3 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void c
            .send('events/' + eventId + '/adjustments', {
              kind: d.get('kind'),
              amountVnd: Number(d.get('amountVnd')),
              reason: d.get('reason'),
              evidence: d.get('evidence'),
            })
            .then((r) => {
              if (r) reload();
            });
        }}
      >
        <label className="block">
          Loại đề nghị
          <select className={field} name="kind">
            <option value="REVERSAL">Đảo toàn bộ xác minh minh họa sai trước cấp quyền</option>
            <option value="REFUND">Yêu cầu hoàn — cần chính sách</option>
            <option value="ADJUSTMENT">Yêu cầu điều chỉnh — cần chính sách</option>
          </select>
        </label>
        <label className="block">
          Số tiền đề nghị
          <input
            className={field}
            name="amountVnd"
            required
            type="number"
            min="1"
            max="2147483647"
            step="1"
            defaultValue={amount}
          />
        </label>
        <label className="block">
          Lý do đề nghị
          <textarea name="reason" className={field} required maxLength={1000} />
        </label>
        <label className="block">
          Bằng chứng đề nghị
          <textarea name="evidence" className={field} required maxLength={2000} />
        </label>
        <button disabled={c.busy} className={button}>
          Gửi đề nghị tài chính
        </button>
        <Feedback command={c} />
      </form>
    </details>
  );
}
