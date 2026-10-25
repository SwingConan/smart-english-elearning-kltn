import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { Rubric } from '@/features/rubrics/api';
import { rubricApi } from '@/features/rubrics/api';
import { ApiError } from '@/lib/api-client';

type CriterionForm = {
  code: string;
  name: string;
  description: string;
  maxScore: number;
  weight: number;
};
const criterion = (): CriterionForm => ({
  code: '',
  name: '',
  description: '',
  maxScore: 10,
  weight: 1,
});
const emptyForm = { id: '', name: '', description: '', criteria: [criterion()] };

export function InstructorRubricsPage() {
  const [items, setItems] = useState<Rubric[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const load = useCallback(() => {
    return rubricApi
      .list()
      .then((rows) => {
        setItems(rows);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);
  useEffect(() => void load(), [load]);

  const edit = async (id: string) => {
    const item = await rubricApi.get(id);
    if (!item.canEdit) return;
    setForm({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      criteria: item.criteria.map((row) => ({
        code: row.code ?? '',
        name: row.name,
        description: row.description ?? '',
        maxScore: Number(row.maxScore),
        weight: Number(row.weight),
      })),
    });
  };
  const setCriterion = (index: number, value: Partial<CriterionForm>) =>
    setForm((current) => ({
      ...current,
      criteria: current.criteria.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...value } : row,
      ),
    }));
  const move = (index: number, offset: number) =>
    setForm((current) => {
      const next = [...current.criteria];
      const target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return { ...current, criteria: next };
    });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const codes = form.criteria.map((row) => row.code.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) {
      setError('Mã tiêu chí không được trùng nhau.');
      return;
    }
    if (
      form.criteria.some(
        (row) => !row.code.trim() || !row.name.trim() || row.maxScore <= 0 || row.weight <= 0,
      )
    ) {
      setError('Mỗi tiêu chí cần mã, tên, điểm tối đa và trọng số hợp lệ.');
      return;
    }
    const input = {
      name: form.name,
      description: form.description || undefined,
      criteria: form.criteria.map((row) => ({ ...row, description: row.description || undefined })),
    };
    try {
      if (form.id) await rubricApi.update(form.id, input);
      else await rubricApi.create(input);
      setForm(emptyForm);
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? 'Rubric đã được gán nên tiêu chí đã khóa. Hãy tạo rubric mới để thay đổi cách chấm mà không làm sai lịch sử.'
          : 'Chưa thể lưu rubric. Vui lòng kiểm tra dữ liệu và thử lại.',
      );
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black">Rubric chấm bài</h1>
      <div className="mt-4 grid gap-4 rounded-3xl bg-indigo-950 p-5 text-white md:grid-cols-[1fr_260px]">
        <div>
          <h2 className="text-xl font-bold">Mỗi tiêu chí là một phần của điểm tổng</h2>
          <p className="mt-2 leading-7 text-indigo-100">
            Điểm tối đa xác định thang chấm của tiêu chí; trọng số xác định mức đóng góp tương đối.
            Thứ tự bên dưới cũng là thứ tự giảng viên thấy khi chấm bài.
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 p-4">
          <p className="text-sm text-indigo-200">Xem trước cấu trúc</p>
          <p className="mt-1 text-2xl font-black">{form.criteria.length} tiêu chí</p>
          <p className="mt-1 text-sm">
            Tổng trọng số:{' '}
            {form.criteria
              .reduce((sum, row) => sum + (Number.isFinite(row.weight) ? row.weight : 0), 0)
              .toFixed(2)}
          </p>
        </div>
      </div>
      <form className="mt-6 space-y-5 rounded-2xl border bg-white p-6" onSubmit={save}>
        <h2 className="text-xl font-bold">{form.id ? 'Chỉnh sửa rubric' : 'Tạo rubric mới'}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">Tên rubric</span>
            <input
              className="input-field mt-1"
              minLength={2}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              value={form.name}
            />
          </label>
          <label>
            <span className="text-sm font-semibold">Mô tả</span>
            <input
              className="input-field mt-1"
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              value={form.description}
            />
          </label>
        </div>
        <div className="space-y-4">
          {form.criteria.map((row, index) => (
            <fieldset className="rounded-xl border p-4" key={index}>
              <legend className="px-2 font-semibold">Tiêu chí {index + 1}</legend>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <input
                  aria-label={`Mã tiêu chí ${index + 1}`}
                  className="input-field"
                  onChange={(e) => setCriterion(index, { code: e.target.value })}
                  placeholder="Mã"
                  required
                  value={row.code}
                />
                <input
                  aria-label={`Tên tiêu chí ${index + 1}`}
                  className="input-field"
                  onChange={(e) => setCriterion(index, { name: e.target.value })}
                  placeholder="Tên tiêu chí"
                  required
                  value={row.name}
                />
                <input
                  aria-label={`Mô tả tiêu chí ${index + 1}`}
                  className="input-field"
                  onChange={(e) => setCriterion(index, { description: e.target.value })}
                  placeholder="Mô tả"
                  value={row.description}
                />
                <input
                  aria-label={`Điểm tối đa ${index + 1}`}
                  className="input-field"
                  min="0.01"
                  onChange={(e) => setCriterion(index, { maxScore: Number(e.target.value) })}
                  step="0.01"
                  type="number"
                  value={row.maxScore}
                />
                <input
                  aria-label={`Trọng số ${index + 1}`}
                  className="input-field"
                  min="0.0001"
                  onChange={(e) => setCriterion(index, { weight: Number(e.target.value) })}
                  step="0.01"
                  type="number"
                  value={row.weight}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="btn-secondary"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  type="button"
                >
                  Lên
                </button>
                <button
                  className="btn-secondary"
                  disabled={index === form.criteria.length - 1}
                  onClick={() => move(index, 1)}
                  type="button"
                >
                  Xuống
                </button>
                <button
                  className="btn-secondary"
                  disabled={form.criteria.length === 1}
                  onClick={() =>
                    setForm({
                      ...form,
                      criteria: form.criteria.filter((_, rowIndex) => rowIndex !== index),
                    })
                  }
                  type="button"
                >
                  Xóa tiêu chí
                </button>
              </div>
            </fieldset>
          ))}
        </div>
        <button
          className="btn-secondary"
          onClick={() => setForm({ ...form, criteria: [...form.criteria, criterion()] })}
          type="button"
        >
          Thêm tiêu chí
        </button>
        <div className="flex gap-2">
          <button className="btn-primary">{form.id ? 'Lưu rubric' : 'Tạo rubric'}</button>
          {form.id ? (
            <button className="btn-secondary" onClick={() => setForm(emptyForm)} type="button">
              Hủy chỉnh sửa
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {state === 'loading' ? (
        <p className="mt-6" role="status">
          Đang tải rubric…
        </p>
      ) : state === 'error' ? (
        <div className="state-error mt-6" role="alert">
          Không thể tải rubric.{' '}
          <button className="btn-secondary ml-2" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="state-empty mt-6">Chưa có rubric.</div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <article className="rounded-2xl border bg-white p-5" key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>{item.name}</strong>
                  <p className="text-sm text-slate-500">
                    {item.criteria.length} tiêu chí ·{' '}
                    {(item.isOwnedByCurrentInstructor ?? item.canEdit ?? Boolean(item.createdById))
                      ? 'Của tôi'
                      : item.createdById
                        ? 'Rubric của giảng viên khác, chỉ đọc'
                        : 'Rubric hệ thống, chỉ đọc'}{' '}
                    · {item.isActive ? 'Đang dùng' : 'Ngừng dùng'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {(item.canEdit ?? Boolean(item.createdById)) ? (
                    <>
                      <button className="btn-secondary" onClick={() => void edit(item.id)}>
                        Chỉnh sửa
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          void (
                            item.isActive
                              ? rubricApi.deactivate(item.id)
                              : rubricApi.reactivate(item.id)
                          ).then(load)
                        }
                      >
                        {item.isActive ? 'Ngừng dùng' : 'Kích hoạt'}
                      </button>
                    </>
                  ) : (
                    <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm">Chỉ đọc</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
