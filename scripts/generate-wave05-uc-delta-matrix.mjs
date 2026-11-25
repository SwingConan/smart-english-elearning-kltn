import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const w04MatrixPath = path.join(
  repoRoot,
  'docs/v2/v2-road-to-99-argon-wave04/57_UC_FINAL_TRACE_MATRIX.md',
);
const outDir = path.join(repoRoot, 'docs/v2/v2-road-to-99-argon-wave05');

const w04Lines = fs
  .readFileSync(w04MatrixPath, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.startsWith('| `UCV2-'));

const wave05DeltaMap = {
  'UCV2-05': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Fixed public /catalog CourseCard empty-class copy ("0 lớp để xem thông tin" -> "Đang cập nhật lịch khai giảng" / "Chưa có lớp mở đăng ký đợt này — Nhận tư vấn lịch khai giảng"); verified 6 realistic published courses + 0 hidden QA fixtures across desktop & mobile.',
    wave05Evidence:
      'EVIDENCE/WAVE05_E2E_PROOFS.json#block1_safety_and_catalog; screenshots/01-catalog-desktop.png; screenshots/02-catalog-mobile.png',
  },
  'UCV2-06': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Executed 7 Placement sittings (Cohorts A, B, C, G on 200-item LR; Cohorts D, E on 219-item FOUR_SKILLS with 11 Speaking WAV captures + 8 Writing responses; Cohort F on low-sample bank) while keeping original bank release flags false.',
    wave05Evidence:
      'EVIDENCE/WAVE05_E2E_PROOFS.json#block1_safety_and_catalog; EVIDENCE/WAVE05_E2E_PROOFS.json#block3_productive_skills_pending_vs_finalized; screenshots/22-placement-OriginalBankGate-desktop.png',
  },
  'UCV2-07': {
    deltaType: 'WAVE05_PRIMARY_UPGRADE',
    wave05DeltaSummary:
      'Delivered evidence-backed diagnosis (TOEIC Part 1–7, 16 KnowledgeDomains + UNCLASSIFIED, Difficulty A2/B1/B2, S/W Rubric criteria with PENDING_REVIEW=null), identical 110/200 total score contrasting class recommendations (Cohort A -> SE-READ-550-246, Cohort B -> SE-LIST-550-357, Cohort C -> SE-LR-550-OPEN), allowlisted self-study guidance, and 3 AI Advisory uses with honest NOT_CONFIGURED / SAFE_FALLBACK.',
    wave05Evidence:
      'EVIDENCE/WAVE05_E2E_PROOFS.json#block2_teacher_critique_contrasting_cohorts; EVIDENCE/WAVE05_E2E_PROOFS.json#block5_ai_advisory_provider_matrix; screenshots/04-result-cohortA-desktop.png..17-result-cohortG-noOpenSeat-mobile.png',
  },
  'UCV2-12': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Verified class availability projection (OPEN vs WAITLIST_OR_FULL vs ENROLLMENT_CLOSED) and direct enrollment CTA (/admissions?classId=...) vs counseling fallback CTA (/support) on Placement result cards.',
    wave05Evidence:
      'EVIDENCE/WAVE05_E2E_PROOFS.json#block2_teacher_critique_contrasting_cohorts; EVIDENCE/WAVE05_E2E_PROOFS.json#block4_low_sample_and_no_open_class; screenshots/09-result-cohortC-desktop.png; screenshots/16-result-cohortG-noOpenSeat-desktop.png',
  },
  'UCV2-18': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Seeded realistic Vietnamese student/instructor/class identities on disposable demo environment (/my learner dashboard free of raw DEV/QA placeholder titles) and verified browser rendering.',
    wave05Evidence:
      'EVIDENCE/BROWSER_VERIFICATION_WAVE05.json; screenshots/18-student-dashboard-desktop.png; screenshots/19-student-dashboard-mobile.png',
  },
  'UCV2-24': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Connected Placement self-study guidance (AI-3 / deterministic) to published Knowledge Library articles with strict internal URL allowlist (/knowledge/articles/:slug) and honest NO_VETTED_LINK badge when no article exists.',
    wave05Evidence:
      'EVIDENCE/WAVE05_E2E_PROOFS.json#block2_teacher_critique_contrasting_cohorts; EVIDENCE/WAVE05_E2E_PROOFS.json#block5_ai_advisory_provider_matrix; screenshots/05-result-cohortA-drilldown-desktop.png',
  },
  'UCV2-31': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Authored, reviewed, and published 4 curated TOEIC Knowledge Tags & Articles (Part 1–2 Indirect Answers, Part 3–4 Conversations, Part 5–6 Word Forms & Clauses, Speaking/Writing Rubric Guide) for Placement remediation.',
    wave05Evidence:
      'apps/api/test/wave05-demo.fixture.ts; EVIDENCE/WAVE05_E2E_PROOFS.json#block2_teacher_critique_contrasting_cohorts',
  },
  'UCV2-34': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Verified instructor review of 11 Speaking WAV recordings & 8 Writing responses, human Rubric grading (Speaking 66/88, Writing 52/64), and independent HVU release for Cohort E while keeping Cohort D in PENDING_REVIEW (null, never 0).',
    wave05Evidence:
      'EVIDENCE/WAVE05_E2E_PROOFS.json#block3_productive_skills_pending_vs_finalized; screenshots/11-result-cohortD-pendingSW-desktop.png; screenshots/13-result-cohortE-finalSW-desktop.png; screenshots/20-instructor-placement-grading-desktop.png',
  },
  'UCV2-39': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Seeded 6 realistic ClassOfferings across 5 approved CourseVersions (4 open classes, 2 full classes SE-LR-550-FULL & SE-LR-750-FULL, 1 closed enrollment window SE-READ-550-CLOSED) and verified deterministic filtering.',
    wave05Evidence:
      'EVIDENCE/WAVE05_E2E_PROOFS.json#block2_teacher_critique_contrasting_cohorts; EVIDENCE/WAVE05_E2E_PROOFS.json#block4_low_sample_and_no_open_class',
  },
  'UCV2-42': {
    deltaType: 'WAVE05_UPGRADED',
    wave05DeltaSummary:
      'Verified maker-checker instructor assignments and published TeachingSessions for all realistic TOEIC demo ClassOfferings.',
    wave05Evidence: 'apps/api/test/wave05-demo.fixture.ts; EVIDENCE/WAVE05_E2E_PROOFS.json',
  },
  'UCV2-45': {
    deltaType: 'WAVE05_PRIMARY_UPGRADE',
    wave05DeltaSummary:
      'Upgraded PlacementWorkflowPolicy (CRITERIA) to evaluate skill + optional part (P1..P7) + optional domainCode (KnowledgeDomainCode) + minSamples; verified policy version evolution (v1 -> v2 -> v3) without mutating historical attempt snapshots.',
    wave05Evidence:
      'EVIDENCE/WAVE05_E2E_PROOFS.json#block6_policy_version_evolution; screenshots/21-hvu-placement-governance-desktop.png',
  },
};

const parsedRows = w04Lines.map((line) => {
  const cells = line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
  const ucIdRaw = cells[0].replace(/`/g, '');
  const delta = wave05DeltaMap[ucIdRaw] ?? {
    deltaType: 'RETAINED_WAVE04_PASS',
    wave05DeltaSummary: 'Retained Wave 04 verified E2E status with 0 regressions in Wave 05.',
    wave05Evidence: cells[10].replace(/`/g, ''),
  };
  return {
    ucId: ucIdRaw,
    title: cells[1],
    actor: cells[2],
    testId: delta.deltaType !== 'RETAINED_WAVE04_PASS' ? `W05-${ucIdRaw}` : cells[3].replace(/`/g, ''),
    routeUi: cells[4].replace(/`/g, ''),
    apiEndpoints: cells[5].replace(/`/g, ''),
    dbTables: cells[6].replace(/`/g, ''),
    wave04Status: cells[13].replace(/`/g, ''),
    wave05DeltaType: delta.deltaType,
    wave05DeltaSummary: delta.wave05DeltaSummary,
    evidenceFiles: delta.wave05Evidence,
    poGate: cells[11].replace(/`/g, ''),
    postWave05Status: cells[13].replace(/`/g, ''),
  };
});

const mdHeader = `# Ma Trận Truy Vết 57 Use Case & Delta Sau Wave 05 (\`57_UC_POST_WAVE05_DELTA_MATRIX.md\`)

- **Chiến dịch**: \`SMART ENGLISH V2 — ROAD99 WAVE 05 (ARGON ROAD99 — WAVE 05 — PRODUCT-READY PLACEMENT DIAGNOSIS, EXPLAINABLE CLASS RECOMMENDATION, AI ADVISORY & DEMO UX)\`
- **Ngày chốt**: \`2026-11-10\`
- **Nguồn đối chiếu chuẩn**: \`UC_CATALOG_57_LIVE.md\` (giữ nguyên chính xác 100% tên chuẩn và Actor chính của cả 57 Use Case), \`BR-V2-132\` (Wave 04 Checkpoint) và bằng chứng thực thi Wave 05.
- **Nguyên tắc phân loại bảo thủ (Conservative Non-Overclaiming)**:
  - **Không tự ý đổi nhãn cả 57 UC thành Production Complete**.
  - **11 Use Case được nâng cấp trực tiếp trong Wave 05** (\`UCV2-05, 06, 07, 12, 18, 24, 31, 34, 39, 42, 45\`): bổ sung chẩn đoán năng lực theo bằng chứng (TOEIC Part 1–7, 16 miền kiến thức, độ khó, tiêu chí Rubric S/W), đối sánh gợi ý lớp cho các học viên cùng tổng điểm 110/200 nhưng lệch kỹ năng, 3 chức năng AI Advisory kèm chế độ không cần khóa (\`NOT_CONFIGURED\` / \`SAFE_FALLBACK\`), và làm sạch UX trang Kết quả Placement & Catalog.
  - **3 Use Case Placement (\`UCV2-06, 07, 45\`)** dù đã hoàn tất 100% yêu cầu sản phẩm & E2E của Wave 05 vẫn **giữ nguyên nhãn bảo thủ \`TECHNICAL_E2E_PENDING_ACADEMIC_RELEASE\`** vì 4 cờ khóa phát hành ngân hàng đề gốc (\`MEDIA_QA_PASS=false, ACADEMIC_APPROVED=false, PUBLISHED=false, learnerPublishable=false\`) được giữ nguyên theo lệnh PO chờ Hội đồng Học thuật ký duyệt.
  - **46 Use Case còn lại** giữ nguyên trạng thái đã nghiệm thu ở Wave 04 (\`BR-V2-132\`) với **0 lỗi hồi quy (0 regressions)**.

## 1. Tổng Hợp Trạng Thái 57 Use Case Sau Wave 05

| Nhãn Đánh Giá Sau Wave 05 | Số Lượng UC | Số UC Nâng Cấp Trực Tiếp Ở Wave 05 | Danh Sách Use Case |
|---|---:|---:|---|
| \`PASS_DISPOSABLE_E2E_REVIEWABLE\` | **51** | **8** (\`UCV2-05, 12, 18, 24, 31, 34, 39, 42\`) | \`UCV2-01, 02, 04, 05, 09..14, 16..44, 46..57\` |
| \`PASS_SCOPED_HISTORICAL\` | **1** | **0** | \`UCV2-08\` |
| \`TECHNICAL_E2E_PENDING_ACADEMIC_RELEASE\` | **3** | **3** (\`UCV2-06, 07, 45\` — Nâng cấp trọng tâm Wave 05) | \`UCV2-06, 07, 45\` |
| \`TECHNICAL_E2E_PENDING_EXT_PROVIDER\` | **2** | **0** | \`UCV2-03, 15\` |
| \`PARTIAL\` / \`BLOCKED\` / \`NOT_TESTED\` | **0** | **0** | *(Không có)* |
| **Tổng cộng** | **57** | **11 UC nâng cấp + 46 UC giữ nguyên** | **UCV2-01 → UCV2-57** |

---

## 2. Bảng Ma Trận Chi Tiết 57 Use Case (Kèm Cột Delta Wave 05)

| UC_ID | Tên Use Case (Chuẩn Catalog) | Actor Chính | Test ID | Route UI | API Endpoints | Bảng DB | Nhãn Wave 04 (\`BR-V2-132\`) | Loại Thay Đổi Wave 05 | Nội Dung Nâng Cấp / Kiểm Chứng Wave 05 | Bằng Chứng Wave 05 / Kế Thừa | Cổng PO (PO Gate) | Nhãn Sau Wave 05 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
`;

const mdRows = parsedRows
  .map(
    (r) =>
      `| \`${r.ucId}\` | ${r.title} | ${r.actor} | \`${r.testId}\` | \`${r.routeUi}\` | \`${r.apiEndpoints}\` | \`${r.dbTables}\` | \`${r.wave04Status}\` | \`${r.wave05DeltaType}\` | ${r.wave05DeltaSummary} | \`${r.evidenceFiles}\` | \`${r.poGate}\` | \`${r.postWave05Status}\` |`,
  )
  .join('\n');

fs.writeFileSync(
  path.join(outDir, '57_UC_POST_WAVE05_DELTA_MATRIX.md'),
  mdHeader + mdRows + '\n',
  'utf8',
);

function csvEscape(val) {
  const s = String(val ?? '');
  if (/^[=+\-@]/.test(s)) return `"'${s.replace(/"/g, '""')}"`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const csvColumns = [
  'UC_ID',
  'Canonical_Title',
  'Primary_Actor',
  'Test_ID',
  'UI_Routes',
  'API_Endpoints',
  'DB_Tables',
  'Wave04_Status',
  'Wave05_Delta_Type',
  'Wave05_Delta_Summary',
  'Evidence_Files',
  'PO_Gate',
  'Post_Wave05_Status',
];

const csvContent = [
  csvColumns.join(','),
  ...parsedRows.map((r) =>
    [
      r.ucId,
      r.title,
      r.actor,
      r.testId,
      r.routeUi,
      r.apiEndpoints,
      r.dbTables,
      r.wave04Status,
      r.wave05DeltaType,
      r.wave05DeltaSummary,
      r.evidenceFiles,
      r.poGate,
      r.postWave05Status,
    ]
      .map(csvEscape)
      .join(','),
  ),
].join('\n');

fs.writeFileSync(
  path.join(outDir, '57_UC_POST_WAVE05_DELTA_MATRIX.csv'),
  csvContent + '\n',
  'utf8',
);
console.log(`Generated 57_UC_POST_WAVE05_DELTA_MATRIX.md and .csv (${parsedRows.length} rows).`);
