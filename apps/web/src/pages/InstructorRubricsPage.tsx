import { FormEvent, useCallback, useEffect, useState } from 'react';
import { rubricApi, Rubric } from '@/features/rubrics/api';

export function InstructorRubricsPage() {
  const [items, setItems] = useState<Rubric[]>([]);
  const [name, setName] = useState('');
  const load = useCallback(() => rubricApi.list().then(setItems), []);
  useEffect(() => {
    void load();
  }, [load]);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    await rubricApi.create({
      name,
      criteria: [{ code: 'CONTENT', name: 'Nội dung', maxScore: 10, weight: 1 }],
    });
    setName('');
    await load();
  };
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-black">Rubric chấm bài</h1>
      <form
        className="mt-6 flex gap-3 rounded-2xl border bg-white p-5"
        onSubmit={(e) => void create(e)}
      >
        <input
          className="flex-1 rounded-xl border p-3"
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên rubric mới"
          required
          value={name}
        />
        <button className="btn-primary">Tạo rubric</button>
      </form>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <article className="rounded-2xl border bg-white p-5" key={item.id}>
            <div className="flex items-center justify-between">
              <div>
                <strong>{item.name}</strong>
                <p className="text-sm text-slate-500">
                  {item.criteria.length} tiêu chí ·{' '}
                  {item.createdById ? 'Rubric của bạn' : 'Rubric hệ thống (chỉ đọc)'}
                </p>
              </div>
              {item.createdById ? (
                <button
                  className="btn-secondary"
                  onClick={() =>
                    void (
                      item.isActive ? rubricApi.deactivate(item.id) : rubricApi.reactivate(item.id)
                    ).then(load)
                  }
                >
                  {item.isActive ? 'Ngừng dùng' : 'Kích hoạt'}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
