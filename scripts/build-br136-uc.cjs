const { readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const root = 'docs/v2/br136/';
const catalog = readFileSync(root + 'inputs/catalog.txt', 'utf8');
const rows = [];
const seen = new Set();
for (const m of catalog.matchAll(/^UCV2-(\d{2}) — (.+)$/gm)) {
  const id = 'UCV2-' + m[1];
  if (seen.has(id)) continue;
  if (rows.length === 57) break;
  seen.add(id);
  rows.push({
    id,
    title: m[2].trim(),
    technicalStatus: ['03', '15'].includes(m[1])
      ? 'EXT_PROVIDER_PENDING'
      : ['06', '07', '45'].includes(m[1])
        ? 'ACADEMIC_PENDING'
        : m[1] === '08'
          ? 'PASS_SCOPED_HISTORICAL'
          : 'PASS_DISPOSABLE_E2E_REVIEWABLE',
    catalogLine: catalog.slice(0, m.index).split('\n').length,
  });
}
rows.sort((a, b) => a.id.localeCompare(b.id));
if (rows.length !== 57 || rows.some((r, i) => r.id !== 'UCV2-' + String(i + 1).padStart(2, '0')))
  throw Error('CANONICAL_57_HEADING_MISMATCH');
const counts = {};
for (const r of rows) counts[r.technicalStatus] = (counts[r.technicalStatus] || 0) + 1;
if (
  Object.values(counts)
    .sort((a, b) => a - b)
    .join(',') !== '1,2,3,51'
)
  throw Error('STATUS_SPLIT_MISMATCH');
const evidence = {
  status: 'PASS',
  canonicalSource:
    'https://docs.google.com/document/d/1iNQ_lHOgllHxCpIJGlpyMy0XU9FUWmbOvzN96J6e0Qw/edit',
  sourceSha256: createHash('sha256').update(catalog).digest('hex'),
  extraction: 'First 57 unique exact top-level canonical headings, before historical appendices',
  statusSource:
    'BR135S independent verdict in Catalog + BR136 prompt; unchanged historical technical statuses, NOT fresh execution of 57 UC',
  count: rows.length,
  exactIdTitleMatches: 57,
  inventedTitles: 0,
  counts,
  rows,
};
writeFileSync(root + '57UC-canonical.json', JSON.stringify(evidence, null, 2));
writeFileSync(
  root + '57UC-canonical.csv',
  'id,title,technicalStatus,catalogLine\n' +
    rows
      .map((r) =>
        [r.id, r.title, r.technicalStatus, r.catalogLine]
          .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
          .join(','),
      )
      .join('\n') +
    '\n',
);
writeFileSync(
  root + '06_57UC_CANONICAL_TRACE_CORRECTION.md',
  '# Đối chiếu 57 Use Case chuẩn\n\nTrích nguyên tên từ 57 heading đầu của Catalog; giữ nguyên trạng thái kỹ thuật lịch sử, không chuyển thành nghiệm thu production. Nguồn, SHA256, số dòng và phép kiểm tra máy đọc được: `57UC-canonical.json`. Trạng thái không phải kết quả chạy mới 57 UC trong BR136.\n\n' +
    '| ID | Tên chính xác | Trạng thái giữ nguyên |\n|---|---|---|\n' +
    rows.map((r) => `| ${r.id} | ${r.title} | ${r.technicalStatus} |`).join('\n') +
    '\n\n51 disposable reviewable + 1 CMS historical + 3 academic pending + 2 provider pending = 57. Những tên UC06=curriculum, UC07=open classes, UC08=shift transfer, UC45=certification trong báo cáo cũ đều sai; không dùng chúng để đổi Catalog. UC34 là workflow chấm bài; UC42 là phân công giảng viên, không phải cấu hình tiêu chí Placement.\n',
);
console.log(JSON.stringify({ count: rows.length, counts }));
