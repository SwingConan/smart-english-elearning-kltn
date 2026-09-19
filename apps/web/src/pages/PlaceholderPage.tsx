type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section className="rounded-xl border bg-white p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-600">Reserved for the next vertical slice. No business logic is implemented here yet.</p>
    </section>
  );
}
