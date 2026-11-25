type InformationTable = {
  kind: 'assessment-table';
  version: 1;
  caption: string;
  columns: string[];
  rows: string[][];
};

export function parseInformationTable(content: string | null): InformationTable | null {
  if (!content || content.length > 32_768) return null;
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object') return null;
    const table = value as Partial<InformationTable>;
    if (
      table.kind !== 'assessment-table' ||
      table.version !== 1 ||
      typeof table.caption !== 'string' ||
      !table.caption.trim() ||
      !Array.isArray(table.columns) ||
      table.columns.length < 1 ||
      table.columns.length > 12 ||
      !table.columns.every((cell) => typeof cell === 'string' && cell.trim()) ||
      !Array.isArray(table.rows) ||
      table.rows.length < 1 ||
      table.rows.length > 100
    )
      return null;
    const columns = table.columns;
    if (
      !table.rows.every(
        (row) =>
          Array.isArray(row) &&
          row.length === columns.length &&
          row.every((cell) => typeof cell === 'string'),
      )
    )
      return null;
    return {
      kind: 'assessment-table',
      version: 1,
      caption: table.caption,
      columns,
      rows: table.rows,
    };
  } catch {
    return null;
  }
}
