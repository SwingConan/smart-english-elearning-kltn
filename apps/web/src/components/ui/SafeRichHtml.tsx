export function SafeRichHtml({ html }: { html: string }) {
  return (
    <div
      className="prose prose-slate max-w-none [&_a]:font-semibold [&_a]:text-indigo-700 [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_img]:my-6 [&_img]:max-h-[560px] [&_img]:w-full [&_img]:rounded-2xl [&_img]:object-contain [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_p]:leading-8 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
