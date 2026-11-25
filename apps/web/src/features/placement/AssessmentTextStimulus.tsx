import { parseInformationTable } from './information-table';

export function AssessmentTextStimulus({ content }: { content: string | null }) {
  const table = parseInformationTable(content);
  if (!table) {
    // A malformed structured envelope must not expose private JSON as plain text.
    if (content?.includes('assessment-table'))
      return <p role="alert">Không thể tải bảng thông tin.</p>;
    return (
      <div className="whitespace-pre-line rounded-xl bg-slate-50 p-5 leading-7">{content}</div>
    );
  }
  return (
    <div
      className="overflow-x-auto rounded-xl border border-slate-200"
      role="region"
      aria-label={table.caption}
      tabIndex={0}
    >
      <table className="w-full border-collapse text-left">
        <caption className="p-4 text-left font-semibold">{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((column, index) => (
              <th className="border-b p-3" scope="col" key={index}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) =>
                column === 0 ? (
                  <th className="border-b p-3 font-medium" scope="row" key={column}>
                    {cell}
                  </th>
                ) : (
                  <td className="border-b p-3" key={column}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
