import type { ReactNode } from 'react';

const INTERNAL_LINK_RE =
  /\[([^\]\n]{1,200})\]\((\/(?:my\/events\/[a-f0-9-]{36}|classroom\/[a-f0-9-]{36}\/activities\/[a-f0-9-]{36}))\)/;
const INLINE_CODE_RE = /`([^`\n]+)`/;
const BOLD_RE = /\*\*([^\n*](?:[^\n]*?[^\n*])?)\*\*/;
const ITALIC_RE = /(?:^|[^*])\*([^*\s\n](?:[^\n*]*?[^*\s\n])?)\*(?!\*)/;

function inlineContent(value: string, keyPrefix = 'in'): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = value;
  let tokenIndex = 0;

  while (remaining.length > 0) {
    const linkMatch = INTERNAL_LINK_RE.exec(remaining);
    const codeMatch = INLINE_CODE_RE.exec(remaining);
    const boldMatch = BOLD_RE.exec(remaining);
    const rawItalicMatch = ITALIC_RE.exec(remaining);

    // Adjust italic match index if a leading non-'*' char was captured
    const italicStart =
      rawItalicMatch == null
        ? -1
        : rawItalicMatch[0].startsWith('*')
          ? rawItalicMatch.index
          : rawItalicMatch.index + 1;

    type Candidate = {
      kind: 'link' | 'code' | 'bold' | 'italic';
      index: number;
      length: number;
      text: string;
      href?: string;
    };

    const candidates: Candidate[] = [];
    if (linkMatch) {
      candidates.push({
        kind: 'link',
        index: linkMatch.index,
        length: linkMatch[0].length,
        text: linkMatch[1],
        href: linkMatch[2],
      });
    }
    if (codeMatch) {
      candidates.push({
        kind: 'code',
        index: codeMatch.index,
        length: codeMatch[0].length,
        text: codeMatch[1],
      });
    }
    if (boldMatch) {
      candidates.push({
        kind: 'bold',
        index: boldMatch.index,
        length: boldMatch[0].length,
        text: boldMatch[1],
      });
    }
    if (rawItalicMatch && italicStart >= 0) {
      const matchedInner = rawItalicMatch[1];
      candidates.push({
        kind: 'italic',
        index: italicStart,
        length: matchedInner.length + 2,
        text: matchedInner,
      });
    }

    if (candidates.length === 0) {
      parts.push(remaining);
      break;
    }

    candidates.sort((a, b) => a.index - b.index);
    const earliest = candidates[0];

    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }

    const nodeKey = `${keyPrefix}-${tokenIndex++}`;
    if (earliest.kind === 'link' && earliest.href) {
      parts.push(
        <a
          className="font-semibold text-indigo-700 underline underline-offset-2"
          href={earliest.href}
          key={nodeKey}
        >
          {inlineContent(earliest.text, `${nodeKey}-l`)}
        </a>,
      );
    } else if (earliest.kind === 'code') {
      parts.push(
        <code
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-900"
          key={nodeKey}
        >
          {earliest.text}
        </code>,
      );
    } else if (earliest.kind === 'bold') {
      parts.push(
        <strong className="font-semibold text-slate-950" key={nodeKey}>
          {inlineContent(earliest.text, `${nodeKey}-b`)}
        </strong>,
      );
    } else {
      parts.push(
        <em className="italic text-slate-800" key={nodeKey}>
          {inlineContent(earliest.text, `${nodeKey}-i`)}
        </em>,
      );
    }

    remaining = remaining.slice(earliest.index + earliest.length);
  }

  return parts;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function parseTableAlignments(separatorLine: string): Array<'left' | 'center' | 'right'> | null {
  if (!separatorLine.includes('|')) return null;
  const cells = splitTableRow(separatorLine);
  if (cells.length === 0) return null;
  const alignments: Array<'left' | 'center' | 'right'> = [];
  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) return null;
    if (cell.startsWith(':') && cell.endsWith(':')) alignments.push('center');
    else if (cell.endsWith(':')) alignments.push('right');
    else alignments.push('left');
  }
  return alignments;
}

export function SafeMarkdown({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let codeLines: string[] | null = null;
  let codeLanguage = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith('```')) {
      if (codeLines) {
        const audioPath = codeLines.join('\n').trim();
        if (
          codeLanguage === 'audio' &&
          /^\/learning\/toeic-foundation\/unit-\d{2}\.wav$/.test(audioPath)
        ) {
          blocks.push(
            <figure
              className="min-w-0 rounded-xl border border-indigo-100 bg-indigo-50 p-4"
              key={`audio-${index}`}
            >
              <figcaption className="mb-3 font-semibold text-slate-900">Audio luyện nghe</figcaption>
              <audio
                aria-label="Audio luyện nghe"
                className="w-full max-w-full"
                controls
                preload="metadata"
                src={audioPath}
              >
                Trình duyệt chưa hỗ trợ phát audio.
              </audio>
              <a
                className="mt-3 inline-block text-sm font-semibold text-indigo-700 underline"
                download
                href={audioPath}
              >
                Tải audio để tự luyện
              </a>
            </figure>,
          );
        } else {
          blocks.push(
            <pre
              className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100"
              key={`code-${index}`}
            >
              <code>{codeLines.join('\n')}</code>
            </pre>,
          );
        }
        codeLines = null;
      } else {
        codeLines = [];
        codeLanguage = line.trim().slice(3).trim();
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) continue;

    // GFM Table: header row + alignment separator row + body rows
    if (line.includes('|') && index + 1 < lines.length) {
      const alignments = parseTableAlignments(lines[index + 1]);
      if (alignments) {
        const headers = splitTableRow(line);
        const bodyRows: string[][] = [];
        let rowIdx = index + 2;
        while (rowIdx < lines.length && lines[rowIdx].trim() && lines[rowIdx].includes('|')) {
          bodyRows.push(splitTableRow(lines[rowIdx]));
          rowIdx += 1;
        }
        const alignClass = (colIdx: number) => {
          const align = alignments[colIdx] ?? 'left';
          if (align === 'center') return 'text-center';
          if (align === 'right') return 'text-right';
          return 'text-left';
        };
        blocks.push(
          <div
            className="overflow-x-auto rounded-xl border border-slate-200 bg-white"
            key={`table-${index}`}
          >
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-slate-900">
                <tr>
                  {headers.map((header, colIdx) => (
                    <th
                      className={`border-b border-slate-200 px-3 py-2.5 font-semibold ${alignClass(colIdx)}`}
                      key={`th-${colIdx}`}
                    >
                      {inlineContent(header, `th-${index}-${colIdx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {bodyRows.map((row, rIdx) => (
                  <tr className="hover:bg-slate-50/60" key={`tr-${rIdx}`}>
                    {headers.map((_, colIdx) => (
                      <td
                        className={`px-3 py-2.5 align-top text-slate-700 ${alignClass(colIdx)}`}
                        key={`td-${rIdx}-${colIdx}`}
                      >
                        {inlineContent(row[colIdx] ?? '', `td-${index}-${rIdx}-${colIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        index = rowIdx - 1;
        continue;
      }
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr className="my-2 border-slate-200" key={`hr-${index}`} />);
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const className = 'font-bold text-slate-950';
      const content = inlineContent(heading[2], `h-${index}`);
      if (heading[1].length === 1)
        blocks.push(
          <h2 className={`text-2xl ${className}`} key={index}>
            {content}
          </h2>,
        );
      else if (heading[1].length === 2)
        blocks.push(
          <h3 className={`text-xl ${className}`} key={index}>
            {content}
          </h3>,
        );
      else
        blocks.push(
          <h4 className={`text-lg ${className}`} key={index}>
            {content}
          </h4>,
        );
      continue;
    }

    const taskItem = /^\s*[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (taskItem) {
      const checked = taskItem[1].toLowerCase() === 'x';
      blocks.push(
        <div className="flex items-start gap-2.5" key={index}>
          <input
            aria-label={checked ? 'Đã hoàn thành' : 'Chưa hoàn thành'}
            checked={checked}
            className="mt-1.5 h-4 w-4 rounded border-slate-300 text-[#5f8b48]"
            readOnly
            type="checkbox"
          />
          <p className="leading-7">{inlineContent(taskItem[2], `task-${index}`)}</p>
        </div>,
      );
      continue;
    }

    const listItem = /^\s*[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      blocks.push(
        <div className="flex gap-3" key={index}>
          <span aria-hidden="true">•</span>
          <p>{inlineContent(listItem[1], `ul-${index}`)}</p>
        </div>,
      );
      continue;
    }

    const orderedItem = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
    if (orderedItem) {
      blocks.push(
        <div className="flex gap-3" key={index}>
          <span className="font-semibold">{orderedItem[1]}.</span>
          <p>{inlineContent(orderedItem[2], `ol-${index}`)}</p>
        </div>,
      );
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      blocks.push(
        <blockquote className="border-l-4 border-indigo-300 pl-4 italic text-slate-600" key={index}>
          {inlineContent(quote[1], `q-${index}`)}
        </blockquote>,
      );
      continue;
    }

    blocks.push(
      <p className="whitespace-pre-wrap leading-8" key={index}>
        {inlineContent(line, `p-${index}`)}
      </p>,
    );
  }

  const unfinishedCode = codeLines as string[] | null;
  if (unfinishedCode) {
    blocks.push(
      <pre
        className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100"
        key="code-final"
      >
        <code>{unfinishedCode.join('\n')}</code>
      </pre>,
    );
  }

  return (
    <div className="space-y-4 text-slate-700" data-testid="safe-markdown">
      {blocks}
    </div>
  );
}
