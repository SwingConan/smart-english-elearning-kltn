import { ServiceUnavailableException } from '@nestjs/common';

/** A network boundary: hiding extra properties in React is insufficient. */
export function candidateStimulusText(content: string | null): string | null {
  if (!content) return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    if (
      !content.includes('assessment-table') &&
      !(content.trimStart().startsWith('{') && content.includes('"kind"'))
    )
      return content;
    throw new ServiceUnavailableException({
      code: 'INFORMATION_TABLE_UNAVAILABLE',
      message: 'Không thể tải bảng thông tin của bài kiểm tra.',
    });
  }
  if (!parsed || typeof parsed !== 'object') return content;
  const structured = parsed as Record<string, unknown>;
  if (!('kind' in structured)) return content;
  if (structured.kind !== 'assessment-table') {
    throw new ServiceUnavailableException({
      code: 'STIMULUS_KIND_UNSUPPORTED',
      message: 'Định dạng nội dung chưa được hỗ trợ.',
    });
  }
  try {
    if (content.length > 32768) throw new Error('oversized');
    const value = parsed as Record<string, unknown>;
    const { caption, columns, rows } = value;
    if (
      value.kind !== 'assessment-table' ||
      value.version !== 1 ||
      typeof caption !== 'string' ||
      !caption.trim() ||
      !Array.isArray(columns) ||
      !columns.length ||
      columns.length > 12 ||
      !columns.every((cell) => typeof cell === 'string' && cell.trim()) ||
      !Array.isArray(rows) ||
      !rows.length ||
      rows.length > 100 ||
      !rows.every(
        (row) =>
          Array.isArray(row) &&
          row.length === columns.length &&
          row.every((cell) => typeof cell === 'string'),
      )
    )
      throw new Error('invalid');
    return JSON.stringify({ kind: 'assessment-table', version: 1, caption, columns, rows });
  } catch {
    throw new ServiceUnavailableException({
      code: 'INFORMATION_TABLE_UNAVAILABLE',
      message: 'Không thể tải bảng thông tin của bài kiểm tra.',
    });
  }
}
