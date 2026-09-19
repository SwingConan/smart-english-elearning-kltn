export function HomePage() {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Project Skeleton v0.1</p>
        <h1 className="text-4xl font-bold tracking-tight">Smart English E-Learning</h1>
        <p className="max-w-3xl text-slate-600">
          React/Vite frontend connected to a NestJS modular-monolith API. The first real vertical slice
          will be Auth → Public Catalog → Course/Class/Enrollment.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Frontend', 'React + Vite + TypeScript'],
          ['Backend', 'NestJS + REST + Swagger'],
          ['Adaptive core', 'BKT + Adaptive in TypeScript'],
        ].map(([title, value]) => (
          <article key={title} className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
