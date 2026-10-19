import { FileText, Globe2, ListChecks, Mail, MessagesSquare, Newspaper } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  parseReadingStimulus,
  type ReadingDocument,
  type ReadingDocumentType,
} from '@/features/assessments/reading-stimulus';

const documentLabels: Record<ReadingDocumentType, string> = {
  GENERIC_DOCUMENT: 'Tài liệu',
  EMAIL: 'Email',
  WEB_PAGE: 'Trang web',
  ARTICLE: 'Bài báo',
  RESPONSIBILITY_LIST: 'Nhiệm vụ & trách nhiệm',
  CHAT: 'Đoạn chat',
};

const documentIcons: Record<ReadingDocumentType, typeof FileText> = {
  GENERIC_DOCUMENT: FileText,
  EMAIL: Mail,
  WEB_PAGE: Globe2,
  ARTICLE: Newspaper,
  RESPONSIBILITY_LIST: ListChecks,
  CHAT: MessagesSquare,
};

export function ReadingStimulusRenderer({ text }: { text: string }) {
  const parsed = parseReadingStimulus(text);
  return (
    <div className="space-y-4" data-reading-document-count={parsed.documents.length}>
      {parsed.documents.map((document, index) => (
        <ReadingDocumentCard document={document} index={index} key={`${document.type}-${index}`} />
      ))}
    </div>
  );
}

function ReadingDocumentCard({ document, index }: { document: ReadingDocument; index: number }) {
  const Icon = documentIcons[document.type];
  return (
    <article
      aria-label={`${documentLabels[document.type]} ${index + 1}`}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-document-type={document.type}
    >
      <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-600 sm:px-5">
        <Icon aria-hidden="true" size={16} />
        {documentLabels[document.type]}
      </header>
      <div className="p-4 text-[0.95rem] leading-7 text-slate-800 sm:p-5">
        {document.type === 'EMAIL' ? (
          <EmailDocument document={document} />
        ) : document.type === 'CHAT' ? (
          <ChatDocument document={document} />
        ) : document.type === 'WEB_PAGE' ? (
          <WebDocument document={document} />
        ) : document.type === 'RESPONSIBILITY_LIST' ? (
          <ResponsibilityDocument document={document} />
        ) : document.type === 'ARTICLE' ? (
          <ArticleDocument document={document} />
        ) : (
          <MarkerText text={document.rawText} />
        )}
      </div>
    </article>
  );
}

function EmailDocument({ document }: { document: ReadingDocument }) {
  const lines = document.rawText.split('\n');
  const body = lines.slice(document.emailBodyStartLine ?? document.contentStartLine).join('\n');
  return (
    <>
      {document.heading && <DocumentHeading>{document.heading}</DocumentHeading>}
      <dl className="mb-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl bg-indigo-50/70 px-4 py-3 text-sm">
        {document.emailMetadata?.map((item, index) => (
          <div className="contents" key={`${item.label}-${index}`}>
            <dt className="font-semibold text-slate-600">{item.label}:</dt>
            <dd className="min-w-0 break-words text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
      <MarkerText text={body} />
    </>
  );
}

function ChatDocument({ document }: { document: ReadingDocument }) {
  return (
    <ol className="space-y-3">
      {document.chatMessages?.map((message, index) => (
        <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" key={index}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <strong className="text-indigo-900">{message.speaker}</strong>
            <time className="text-xs font-medium text-slate-500">({message.timestamp}):</time>
          </div>
          <p className="mt-1 text-slate-800">{message.message}</p>
        </li>
      ))}
    </ol>
  );
}

function WebDocument({ document }: { document: ReadingDocument }) {
  const lines = document.rawText.split('\n');
  const table = document.table;
  const before = lines
    .slice(document.contentStartLine, table?.startLine ?? lines.length)
    .join('\n');
  const after = table ? lines.slice(table.endLine + 1).join('\n') : '';
  return (
    <>
      {document.heading && <DocumentHeading>{document.heading}</DocumentHeading>}
      <MarkerText text={before} />
      {table && (
        <div className="my-5 max-w-full overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {table.rows[0].map((cell, index) => (
                  <th
                    className="border-b border-r border-slate-200 px-3 py-2.5 last:border-r-0"
                    key={index}
                    scope="col"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(1).map((row, rowIndex) => (
                <tr className="odd:bg-white even:bg-slate-50" key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      className="border-b border-r border-slate-200 px-3 py-2.5 last:border-r-0"
                      key={cellIndex}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {after && <MarkerText text={after} />}
    </>
  );
}

function ResponsibilityDocument({ document }: { document: ReadingDocument }) {
  return (
    <>
      {document.heading && <DocumentHeading>{document.heading}</DocumentHeading>}
      <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200">
        {document.responsibilityItems?.map((item, index) => (
          <div
            className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(9rem,0.45fr)_1fr] sm:gap-4"
            key={index}
          >
            {item.label ? <dt className="font-semibold text-slate-700">{item.label}:</dt> : null}
            <dd className="min-w-0 text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function ArticleDocument({ document }: { document: ReadingDocument }) {
  const lines = document.rawText.split('\n');
  const body = lines.slice(document.articleBodyStartLine ?? document.contentStartLine).join('\n');
  return (
    <>
      {document.heading && (
        <h3 className="text-xl font-bold leading-snug text-slate-950">{document.heading}</h3>
      )}
      {document.articleByline && (
        <p className="mt-1 text-sm italic text-slate-500">{document.articleByline}</p>
      )}
      <div className="mt-5">
        <MarkerText text={body} />
      </div>
    </>
  );
}

function DocumentHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-4 text-base font-bold tracking-wide text-slate-950">{children}</h3>;
}

function MarkerText({ text }: { text: string }) {
  const parts = text.split(/((?:-------\s*)?\[\d+\]|—\s*\[\d+\]\s*—)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, index) =>
        /\[\d+\]/.test(part) ? (
          <mark className="rounded bg-amber-100 px-1 py-0.5 font-bold text-amber-950" key={index}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </p>
  );
}
