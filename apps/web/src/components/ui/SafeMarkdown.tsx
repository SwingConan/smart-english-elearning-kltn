import type { ReactNode } from 'react';

export function SafeMarkdown({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let codeLines: string[] | null = null;

  lines.forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      if (codeLines) {
        blocks.push(
          <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100" key={`code-${index}`}>
            <code>{codeLines.join('\n')}</code>
          </pre>,
        );
        codeLines = null;
      } else {
        codeLines = [];
      }
      return;
    }
    if (codeLines) {
      codeLines.push(line);
      return;
    }
    if (!line.trim()) return;

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const className = 'font-bold text-slate-950';
      if (heading[1].length === 1) blocks.push(<h2 className={`text-2xl ${className}`} key={index}>{heading[2]}</h2>);
      else if (heading[1].length === 2) blocks.push(<h3 className={`text-xl ${className}`} key={index}>{heading[2]}</h3>);
      else blocks.push(<h4 className={`text-lg ${className}`} key={index}>{heading[2]}</h4>);
      return;
    }
    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      blocks.push(<div className="flex gap-3" key={index}><span aria-hidden="true">•</span><p>{listItem[1]}</p></div>);
      return;
    }
    const orderedItem = /^\d+[.)]\s+(.+)$/.exec(line);
    if (orderedItem) {
      blocks.push(<div className="flex gap-3" key={index}><span className="font-semibold">{line.split(/[.)]/)[0]}.</span><p>{orderedItem[1]}</p></div>);
      return;
    }
    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      blocks.push(<blockquote className="border-l-4 border-indigo-300 pl-4 italic text-slate-600" key={index}>{quote[1]}</blockquote>);
      return;
    }
    blocks.push(<p className="whitespace-pre-wrap leading-8" key={index}>{line}</p>);
  });

  const unfinishedCode = codeLines as string[] | null;
  if (unfinishedCode) {
    blocks.push(<pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100" key="code-final"><code>{unfinishedCode.join('\n')}</code></pre>);
  }

  return <div className="space-y-4 text-slate-700" data-testid="safe-markdown">{blocks}</div>;
}
