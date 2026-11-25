import type {
  AiAdvisoryCustomProviderInput,
  AiAdvisoryRawCandidate,
} from './placement-diagnosis-advisory';

export const ADVICE_SCHEMA_VERSION = 'BR136_V1';
export const ADVICE_PROMPT_VERSION = 'BR136_PROMPT_V1';
export interface AdviceFragments {
  schemaVersion: typeof ADVICE_SCHEMA_VERSION;
  diagnosis: { strategy: 'EVIDENCE_REVIEW'; domainCodes: string[] };
  classFit: { strategy: 'EXPLAIN_RULES'; courseVersionIds: string[] };
  selfStudy: { strategy: 'GUIDED_PRACTICE'; articlePaths: string[] };
}
const stringArray = { type: 'array', maxItems: 5, items: { type: 'string' } };
function section(strategy: string, field: string) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['strategy', field],
    properties: { strategy: { type: 'string', enum: [strategy] }, [field]: stringArray },
  };
}
export const ADVICE_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'diagnosis', 'classFit', 'selfStudy'],
  properties: {
    schemaVersion: { type: 'string', enum: [ADVICE_SCHEMA_VERSION] },
    diagnosis: section('EVIDENCE_REVIEW', 'domainCodes'),
    classFit: section('EXPLAIN_RULES', 'courseVersionIds'),
    selfStudy: section('GUIDED_PRACTICE', 'articlePaths'),
  },
};

/** Only enum decisions and server-owned references may cross the model boundary. No model prose is rendered. */
export function renderStructuredAdvice(
  value: unknown,
  input: AiAdvisoryCustomProviderInput,
): AiAdvisoryRawCandidate {
  const invalid = () => {
    throw new Error('INVALID_AI_OUTPUT_SCHEMA: strict advice fragments required');
  };
  function keys(v: unknown, expected: string[]): asserts v is Record<string, unknown> {
    if (
      !v ||
      typeof v !== 'object' ||
      Array.isArray(v) ||
      Object.keys(v).sort().join('|') !== [...expected].sort().join('|')
    )
      invalid();
  }
  function refs(v: unknown, strategy: string, field: string): string[] {
    keys(v, ['strategy', field]);
    const a = v[field];
    if (
      v.strategy !== strategy ||
      !Array.isArray(a) ||
      a.length > 5 ||
      a.some((x) => typeof x !== 'string' || x.length > 250) ||
      new Set(a).size !== a.length
    )
      invalid();
    return a as string[];
  }
  keys(value, ['schemaVersion', 'diagnosis', 'classFit', 'selfStudy']);
  if (value.schemaVersion !== ADVICE_SCHEMA_VERSION) invalid();
  const domainCodes = refs(value.diagnosis, 'EVIDENCE_REVIEW', 'domainCodes');
  const courseIds = refs(value.classFit, 'EXPLAIN_RULES', 'courseVersionIds');
  const paths = refs(value.selfStudy, 'GUIDED_PRACTICE', 'articlePaths');
  const d = input.diagnosis,
    r = input.recommendation;
  const domains = domainCodes.map((code) => {
    const domain = d.knowledgeBreakdown.find(
      (k) => k.domainCode === code && code !== 'UNCLASSIFIED',
    );
    if (!domain) throw new Error('SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED: unknown domain');
    return domain;
  });
  const courses = courseIds.map((id) => {
    const c = r.courseEvaluations.find(
      (c) =>
        c.courseVersionId === id &&
        ['RECOMMENDED_PRIORITY', 'ELIGIBLE_ALTERNATIVE', 'ELIGIBLE_NO_OPEN_CLASS'].includes(
          c.status,
        ),
    );
    if (!c) throw new Error('SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED: unapproved course');
    return c;
  });
  const resources = paths.map((path) => {
    const group = input.selfStudyGuidance.find((g) =>
      g.vettedResources.some((v) => v.path === path),
    );
    const resource = group?.vettedResources.find(
      (v) =>
        v.path === path &&
        v.kind === 'KNOWLEDGE_ARTICLE' &&
        v.path === `/knowledge/articles/${encodeURIComponent(v.slug)}`,
    );
    if (!resource || !/^\/knowledge\/articles\/[a-zA-Z0-9_%~-]+$/.test(path))
      throw new Error('UNVERIFIED_EXTERNAL_URL_BLOCKED');
    return { group: group!, resource };
  });
  const s = d.overallSummary;
  const wrongTotal =
    s.lrCorrectCount === null ? 0 : Math.max(0, s.lrAnsweredCount - s.lrCorrectCount);
  const unansweredTotal = Math.max(0, s.lrTotalItems - s.lrAnsweredCount);
  const completionDetail =
    s.lrCorrectCount === null
      ? `Đã ghi nhận ${s.lrAnsweredCount} trên ${s.lrTotalItems} câu trả lời.`
      : `Đã làm ${s.lrAnsweredCount} trên tổng ${s.lrTotalItems} câu (Đúng ${s.lrCorrectCount} câu, Sai ${wrongTotal} câu${unansweredTotal > 0 ? `, Chưa làm ${unansweredTotal} câu` : ''}).`;
  const overall =
    s.lrCorrectCount === null
      ? 'Nghe – Đọc đang chờ công bố điểm.'
      : `Tổng kết Nghe – Đọc: ${s.lrCorrectCount}/${s.lrTotalItems} câu đúng (${s.lrAccuracyPct}%). ${completionDetail} Điểm nội bộ, không phải điểm TOEIC chính thức.`;
  const wrongParts = (d.partBreakdown ?? [])
    .filter(
      (p) =>
        (p.answered ?? 0) > 0 &&
        p.answered > p.correct &&
        Math.round((p.correct / p.answered) * 100) < 70,
    )
    .map((p) => `${p.part} (sai ${p.answered - p.correct} trên ${p.answered} câu)`);
  const wrongPartsNote = wrongParts.length
    ? `Các phần cần tập trung cải thiện nhất: ${wrongParts.join(', ')}.`
    : '';
  const evidence = domains
    .map((k) => {
      const answered = k.answered ?? k.samples;
      const g = (input.selfStudyGuidance ?? []).find((item) => item.domainCode === k.domainCode);
      const action =
        answered === 0
          ? 'Chưa trả lời các câu ở mảng này.'
          : k.canClaimWeakness
            ? (g?.focusSummaryVi ?? 'Ưu tiên ôn tập theo các câu sai ở phần này.')
            : 'Chưa làm đủ số câu để đánh giá rõ phần này.';
      return `${k.titleVi} (đúng ${k.correct} trên ${answered} câu, đạt ${k.accuracyPct ?? 0}%): ${action}`;
    })
    .join(' ');
  const productive = d.productiveSkills
    .map((p) =>
      p.status === 'PUBLISHED'
        ? `${p.skill}: ${p.totalScore} điểm rubric nội bộ đã được giáo viên xác nhận và công bố.`
        : `${p.skill}: ĐANG CHẤM, chưa có điểm công bố.`,
    )
    .join(' ');
  const wrongPartCodes = (d.partBreakdown ?? [])
    .filter(
      (p) =>
        (p.answered ?? 0) > 0 &&
        p.answered > p.correct &&
        Math.round((p.correct / p.answered) * 100) < 70,
    )
    .map((p) => p.part);
  const weakDomainTitles = (d.improvements ?? []).map((imp) => imp.titleVi);
  const diagnosisBridge = [
    s.listeningCorrect != null && s.readingCorrect != null
      ? `Từ nhận xét đầu vào (Nghe ${s.listeningCorrect} trên ${s.listeningSamples} câu, Đọc ${s.readingCorrect} trên ${s.readingSamples} câu)`
      : '',
    wrongPartCodes.length > 0 ? `với các phần cần cải thiện (${wrongPartCodes.join(', ')})` : '',
    weakDomainTitles.length > 0 ? `và trọng tâm lỗi ở ${weakDomainTitles[0]}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const openClassSummary = [...r.availableClasses, ...r.unavailableClasses]
    .filter((c) => courseIds.includes(c.courseVersionId) && c.availabilityStatus === 'AVAILABLE_NOW')
    .map(
      (c) =>
        `${c.classCode} — ${c.className}${c.courseLevel ? ` [Trình độ ${c.courseLevel}]` : ''} (Còn ${c.availableSeats} chỗ${c.matchedDiagnosisPointsVi?.length ? `; ${c.matchedDiagnosisPointsVi[0]}` : ''})`,
    )
    .join('; ');
  const fullClassSummary = [...r.availableClasses, ...r.unavailableClasses]
    .filter((c) => courseIds.includes(c.courseVersionId) && c.availabilityStatus !== 'AVAILABLE_NOW')
    .map((c) => `${c.classCode} (đã đủ sĩ số)`)
    .join(', ');
  const courseListSummary = courses
    .map((c) => `${c.courseTitle}${c.level ? ` (${c.level})` : ''}`)
    .join(' và ');
  const classFitText = [
    r.overallSummaryVi,
    diagnosisBridge && courseListSummary
      ? `${diagnosisBridge}, AI phân tích đối chiếu và đề xuất chương trình phù hợp: ${courseListSummary}.`
      : courseListSummary
        ? `Chương trình phù hợp với kết quả của bạn: ${courseListSummary}.`
        : '',
    openClassSummary ? `Lớp đang mở nhận học viên khớp nhận xét: ${openClassSummary}.` : '',
    fullClassSummary ? `Lớp tạm hết chỗ: ${fullClassSummary}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    fragments: value as unknown as AdviceFragments,
    diagnosisAdvisory: `${overall} ${s.balanceLabelVi} ${wrongPartsNote} ${evidence} ${productive}`
      .replace(/\s+/g, ' ')
      .trim(),
    classFitAdvisory:
      classFitText || 'Hiện chưa có lớp nào phù hợp trực tiếp với mức điểm hiện tại.',
    selfStudyAdvisory: resources.length
      ? resources
          .map(
            ({ group, resource }) =>
              `${group.skill} — ${resource.title}: ${resource.path}. ${group.focusSummaryVi ?? 'Ôn nội dung, làm bài luyện tập và đối chiếu lỗi theo chủ điểm.'}`,
          )
          .join(' ')
      : 'Chưa chọn học liệu nội bộ đã được duyệt; xem hướng dẫn theo chủ điểm và chờ học liệu công bố.',
    claimedCorrectCount: s.lrCorrectCount ?? undefined,
    claimedEligibleCourseVersionIds: courseIds,
    referencedPaths: paths,
  };
}
