import { renderStructuredAdvice, type AdviceFragments } from './structured-advice';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PlacementSnapshot } from './source-eligibility';

export type SampleSufficiency = 'SUFFICIENT' | 'LOW_SAMPLE' | 'NO_EVIDENCE' | 'UNCLASSIFIED_TAG';

export type DifficultyBandCode =
  'A2_FOUNDATION' | 'B1_INTERMEDIATE' | 'B2_ADVANCED' | 'UNAVAILABLE';

export type KnowledgeDomainCode =
  | 'LISTENING_VISUAL_ACTION'
  | 'LISTENING_WH_DIRECT'
  | 'LISTENING_INDIRECT_RESPONSE'
  | 'LISTENING_WORKPLACE_CONVERSATION'
  | 'LISTENING_SERVICE_LOGISTICS'
  | 'LISTENING_ANNOUNCEMENT_TALK'
  | 'GRAMMAR_WORD_FORMS_CLAUSE'
  | 'GRAMMAR_TENSE_VOICE_CONNECTORS'
  | 'VOCAB_BUSINESS_COLLOCATION'
  | 'READING_TEXT_COHESION'
  | 'READING_SINGLE_PASSAGE_DETAIL'
  | 'READING_MULTI_PASSAGE_SYNTHESIS'
  | 'SPEAKING_PRONUNCIATION_DESCRIPTION'
  | 'SPEAKING_INTERACTION_SOLUTION'
  | 'WRITING_SENTENCE_EMAIL'
  | 'WRITING_OPINION_ESSAY'
  | 'UNCLASSIFIED';

export interface PartDiagnosticRow {
  part: string;
  partNumber: number | null;
  skill: string;
  titleVi: string;
  descriptionVi: string;
  samples: number;
  answered: number;
  correct: number;
  wrong?: number;
  unanswered?: number;
  answeredAccuracyPct?: number | null;
  accuracyPct: number | null;
  minSamplesRequired: number;
  sufficiency: SampleSufficiency;
  statusLabel: string;
  canClaimWeakness: boolean;
}

export interface KnowledgeDomainDiagnosticRow {
  domainCode: KnowledgeDomainCode;
  skill: string;
  partScope: string;
  titleVi: string;
  descriptionVi: string;
  samples: number;
  answered: number;
  correct: number;
  wrong?: number;
  unanswered?: number;
  answeredAccuracyPct?: number | null;
  accuracyPct: number | null;
  minSamplesRequired: number;
  sufficiency: SampleSufficiency;
  statusLabel: string;
  canClaimWeakness: boolean;
  observedTopicTags: string[];
  linkedArticleSlugs: string[];
}

export interface DifficultyDiagnosticRow {
  bandCode: DifficultyBandCode;
  titleVi: string;
  samples: number;
  answered: number;
  correct: number;
  accuracyPct: number | null;
  sufficiency: SampleSufficiency;
  statusLabel: string;
}

export interface CompetencyHighlight {
  rank: number;
  kind: 'STRENGTH' | 'IMPROVEMENT_PRIORITY';
  domainCode: KnowledgeDomainCode;
  partScope: string;
  skill: string;
  titleVi: string;
  correct: number;
  samples: number;
  accuracyPct: number;
  evidenceBadge: string;
  pedagogicalSummary: string;
  actionableStep: string;
}

export interface ProductiveSkillCriterionSummary {
  taskGroupId: string;
  taskTitle: string;
  code: string;
  score: number;
  maxScore: number | null;
  feedbackText: string;
}

export interface ProductiveSkillDiagnostic {
  skill: 'SPEAKING' | 'WRITING';
  status: 'PUBLISHED' | 'PENDING_REVIEW' | 'NOT_ASSESSED';
  statusLabel: string;
  totalScore: number | null;
  maxPossibleScore: number | null;
  taskCount: number;
  scaleLabel: string | null;
  criteriaBreakdown: ProductiveSkillCriterionSummary[];
  pendingNotice: string | null;
}

export interface VettedStudyResource {
  revisionId?: string;
  slug: string;
  title: string;
  path: string;
  kind: 'KNOWLEDGE_ARTICLE' | 'CLASS_RESOURCE';
  verifiedSource: string;
}

export interface SelfStudyGuidanceItem {
  domainCode: KnowledgeDomainCode;
  partScope: string;
  skill: string;
  topicTitleVi: string;
  observedEvidence: string;
  focusSummaryVi: string;
  searchKeywords: string[];
  resourceStatus: 'VETTED_AVAILABLE' | 'NO_VETTED_LINK';
  resourceStatusLabel: string;
  vettedResources: VettedStudyResource[];
}

export type AiProviderState =
  'NOT_CONFIGURED' | 'SAFE_FALLBACK' | 'CONNECTED_UNVERIFIED' | 'VERIFIED_LIVE';

export interface PlacementAiAdvisoryOutput {
  providerStatus: AiProviderState;
  liveVerified: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  modeBadge: string;
  disclosureVi: string;
  diagnosisAdvisory: string;
  classFitAdvisory: string;
  selfStudyAdvisory: string;
  safetyChecks: {
    promptInjectionSanitized: boolean;
    schemaValidated: boolean;
    scoreImmutabilityVerified: boolean;
    urlAllowlistVerified: boolean;
  };
}

export interface CourseRuleTraceItem {
  skill: string;
  part: string | null;
  domainCode: string | null;
  observedValue: number | null;
  observedSamples: number | null;
  requiredMin: number;
  requiredMax: number;
  requiredMinSamples: number;
  scale: string;
  matched: boolean;
  traceTextVi: string;
}

export interface CourseRecommendationEvaluation {
  courseVersionId: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  level: string;
  skillScope: string;
  courseDescription?: string | null;
  matchedDiagnosisPointsVi?: string[];
  status:
    | 'RECOMMENDED_PRIORITY'
    | 'ELIGIBLE_ALTERNATIVE'
    | 'ELIGIBLE_NO_OPEN_CLASS'
    | 'NOT_ELIGIBLE'
    | 'AWAITING_FINAL_SCORING'
    | 'LR_ONLY_PRELIMINARY'
    | 'INSUFFICIENT_EVIDENCE';
  statusBadgeVi: string;
  priorityRank: number;
  fitSummaryVi: string;
  ruleTraces: CourseRuleTraceItem[];
  openClassCount: number;
  unavailableClassCount: number;
}

export interface ClassAvailabilityEvaluation {
  classId: string;
  classCode: string;
  className: string;
  courseVersionId: string;
  courseTitle: string;
  courseSlug: string;
  courseLevel?: string;
  courseSkillScope?: string;
  courseDescription?: string | null;
  matchedDiagnosisPointsVi?: string[];
  modality: string;
  pricingType: string;
  tuitionFeeVnd: number | null;
  maxStudents: number | null;
  enrolledCount: number;
  availableSeats: number;
  availabilityStatus:
    'AVAILABLE_NOW' | 'WAITLIST_OR_FULL' | 'ENROLLMENT_CLOSED' | 'SCHEDULE_INCOMPLETE';
  availabilityBadgeVi: string;
  scheduleSummaryVi: string[];
  fitReasonsVi: string[];
  unavailabilityReasonCode: string | null;
  unavailabilityReasonVi: string | null;
}

export interface PlacementStructuredDiagnosis {
  snapshotVersion: 'WAVE05_DIAG_V1';
  sourceDigestRef: string;
  minSamplesThreshold: number;
  overallSummary: {
    lrAnsweredCount: number;
    lrTotalItems: number;
    lrCorrectCount: number | null;
    lrAccuracyPct: number | null;
    listeningCorrect: number | null;
    listeningSamples: number;
    listeningAccuracyPct: number | null;
    readingCorrect: number | null;
    readingSamples: number;
    readingAccuracyPct: number | null;
    balanceState: 'LISTENING_STRONGER' | 'READING_STRONGER' | 'BALANCED' | 'PENDING_OR_LOW_SAMPLE';
    balanceLabelVi: string;
    internalScaleDisclosureVi: string;
  };
  partBreakdown: PartDiagnosticRow[];
  knowledgeBreakdown: KnowledgeDomainDiagnosticRow[];
  difficultyBreakdown: DifficultyDiagnosticRow[];
  productiveSkills: ProductiveSkillDiagnostic[];
  strengths: CompetencyHighlight[];
  improvements: CompetencyHighlight[];
  lowSampleNotes: string[];
  limitations: string[];
}

export interface PlacementStructuredRecommendation {
  recommendationVersion: 'WAVE05_REC_V1';
  policyId: string | null;
  policyDigestRef: string | null;
  evaluatedAt: string;
  overallStatus:
    | 'MATCHED_OPEN_CLASS'
    | 'ELIGIBLE_COURSE_NO_OPEN_CLASS'
    | 'LR_ONLY_PRELIMINARY'
    | 'AWAITING_FINAL_SCORING'
    | 'INSUFFICIENT_EVIDENCE'
    | 'NO_MATCHING_COURSE'
    | 'CRITERIA_UNAVAILABLE';
  overallStatusLabelVi: string;
  overallSummaryVi: string;
  courseEvaluations: CourseRecommendationEvaluation[];
  availableClasses: ClassAvailabilityEvaluation[];
  unavailableClasses: ClassAvailabilityEvaluation[];
}

interface ManifestQuestionMeta {
  code: string;
  skill: 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING';
  partCode: string;
  partNumber: number | null;
  difficulty: 'A2' | 'B1' | 'B2' | null;
  topicTag: string | null;
}

const PART_METADATA: Record<
  string,
  { partNumber: number; skill: 'LISTENING' | 'READING'; titleVi: string; descriptionVi: string }
> = {
  P1: {
    partNumber: 1,
    skill: 'LISTENING',
    titleVi: 'Part 1 — Mô tả hình ảnh (Photographs)',
    descriptionVi: 'Nhận diện hành động, trạng thái sự vật và bối cảnh nơi làm việc qua hình ảnh.',
  },
  P2: {
    partNumber: 2,
    skill: 'LISTENING',
    titleVi: 'Part 2 — Phản xạ Hỏi – Đáp ngắn (Question-Response)',
    descriptionVi:
      'Nghe câu hỏi Wh-, Yes/No, câu hỏi đuôi và chọn phản hồi tự nhiên trong giao tiếp.',
  },
  P3: {
    partNumber: 3,
    skill: 'LISTENING',
    titleVi: 'Part 3 — Hội thoại ngắn công sở (Conversations)',
    descriptionVi:
      'Nắm ý chính, chi tiết, hàm ý người nói và đối chiếu bảng biểu trong hội thoại 2–3 người.',
  },
  P4: {
    partNumber: 4,
    skill: 'LISTENING',
    titleVi: 'Part 4 — Thông báo & Bài nói ngắn (Short Talks)',
    descriptionVi:
      'Nghe hiểu thông báo sân bay, tin nhắn thoại, lịch trình sự kiện và bài thuyết trình ngắn.',
  },
  P5: {
    partNumber: 5,
    skill: 'READING',
    titleVi: 'Part 5 — Hoàn thành câu & Ngữ pháp (Incomplete Sentences)',
    descriptionVi:
      'Vận dụng từ loại, thì động từ, thể bị động, liên từ, giới từ và từ vựng thương mại.',
  },
  P6: {
    partNumber: 6,
    skill: 'READING',
    titleVi: 'Part 6 — Hoàn thành đoạn văn (Text Completion)',
    descriptionVi:
      'Điền từ/câu phù hợp mạch văn trong email nội bộ, thông báo khách hàng và văn bản hành chính.',
  },
  P7: {
    partNumber: 7,
    skill: 'READING',
    titleVi: 'Part 7 — Đọc hiểu văn bản đơn & đa văn bản (Reading Comprehension)',
    descriptionVi:
      'Đọc quét thông tin chi tiết, suy luận và tổng hợp thông tin từ 1 đến 3 văn bản liên kết.',
  },
};

export const KNOWLEDGE_DOMAIN_CATALOG: Record<
  KnowledgeDomainCode,
  {
    skill: string;
    partScope: string;
    titleVi: string;
    descriptionVi: string;
    pedagogicalWeaknessVi: string;
    actionableStepVi: string;
    searchKeywords: string[];
    defaultArticleSlug?: string;
  }
> = {
  LISTENING_VISUAL_ACTION: {
    skill: 'LISTENING',
    partScope: 'P1',
    titleVi: 'Nghe nhận diện hành động & bối cảnh tranh (Part 1)',
    descriptionVi:
      'Phân biệt động từ chỉ hành động đang diễn ra (Present Continuous) và trạng thái đồ vật (Passive).',
    pedagogicalWeaknessVi:
      'Cần phân biệt rõ chủ ngữ chỉ người thực hiện hành động và cấu trúc bị động mô tả trạng thái đồ vật trong tranh.',
    actionableStepVi:
      'Luyện nghe nhóm động từ thao tác văn phòng/kho vận và phân biệt thì hiện tại tiếp diễn với hiện tại hoàn thành bị động.',
    searchKeywords: [
      'TOEIC Part 1 động từ mô tả tranh',
      'Present Continuous vs Passive Voice Part 1',
      'Từ vựng bối cảnh văn phòng TOEIC Part 1',
    ],
    defaultArticleSlug: 'toeic-part1-2-listening-reflex-and-indirect-answers',
  },
  LISTENING_WH_DIRECT: {
    skill: 'LISTENING',
    partScope: 'P2',
    titleVi: 'Nghe câu hỏi thông tin trực tiếp Wh-Questions (Part 2)',
    descriptionVi: 'Nhận diện từ để hỏi (Who, When, Where, Why, How, Which) và bẫy đồng âm/lặp từ.',
    pedagogicalWeaknessVi:
      'Dễ mất từ khóa mở đầu câu hỏi (When/Where/Who/How) hoặc bị nhiễu bởi phương án lặp lại từ giống câu hỏi.',
    actionableStepVi:
      'Tập trung bắt âm đầu câu hỏi Wh- và loại trừ ngay các đáp án Yes/No hoặc đáp án lặp từ đồng âm.',
    searchKeywords: [
      'TOEIC Part 2 Wh-questions chiến thuật',
      'Tránh bẫy đồng âm TOEIC Listening Part 2',
      'Phản xạ nghe câu hỏi When Where Who',
    ],
    defaultArticleSlug: 'toeic-part1-2-listening-reflex-and-indirect-answers',
  },
  LISTENING_INDIRECT_RESPONSE: {
    skill: 'LISTENING',
    partScope: 'P2',
    titleVi: 'Nghe phản hồi gián tiếp, đề xuất & câu hỏi đuôi (Part 2)',
    descriptionVi:
      'Xử lý câu trả lời gián tiếp (Indirect Responses), câu hỏi Yes/No, câu đề nghị và nhận xét.',
    pedagogicalWeaknessVi:
      'Còn lúng túng khi đáp án đúng không trả lời trực tiếp mà diễn đạt hàm ý ("Tôi chưa kiểm tra lịch", "Hãy hỏi bộ phận nhân sự").',
    actionableStepVi:
      'Luyện các mẫu câu trả lời gián tiếp thông dụng trong môi trường công sở và câu phản hồi cho lời mời/đề xuất.',
    searchKeywords: [
      'Câu trả lời gián tiếp TOEIC Part 2 Indirect Responses',
      'Mẹo xử lý Statement và Tag Question Part 2',
      'Giao tiếp phản xạ tiếng Anh công sở',
    ],
    defaultArticleSlug: 'toeic-part1-2-listening-reflex-and-indirect-answers',
  },
  LISTENING_WORKPLACE_CONVERSATION: {
    skill: 'LISTENING',
    partScope: 'P3',
    titleVi: 'Nghe hội thoại nội bộ công sở & tra cứu biểu đồ (Part 3)',
    descriptionVi:
      'Theo dõi hội thoại về nhân sự, CNTT, lịch đào tạo, ngân sách và câu hỏi kết hợp bảng biểu.',
    pedagogicalWeaknessVi:
      'Chưa kịp đọc trước câu hỏi để bắt thông tin chuyển hướng ở lượt lời thứ 2–3 hoặc đối chiếu dữ liệu trên bảng biểu.',
    actionableStepVi:
      'Áp dụng kỹ thuật đọc trước 3 câu hỏi (Previewing) trong 8 giây nghỉ và gạch chân từ khóa chỉ người/thời gian/bảng biểu.',
    searchKeywords: [
      'Kỹ thuật đọc trước câu hỏi TOEIC Part 3 Previewing',
      'Nghe hội thoại kèm biểu đồ Graphic Questions Part 3',
      'Từ vựng hội thoại văn phòng nhân sự TOEIC',
    ],
    defaultArticleSlug: 'toeic-part3-4-workplace-conversations-and-talks',
  },
  LISTENING_SERVICE_LOGISTICS: {
    skill: 'LISTENING',
    partScope: 'P3',
    titleVi: 'Nghe hội thoại dịch vụ khách hàng & vận hành (Part 3)',
    descriptionVi:
      'Nắm bắt vấn đề phát sinh và hành động tiếp theo trong giao dịch bán lẻ, vận chuyển, sự kiện.',
    pedagogicalWeaknessVi:
      'Khó nhận diện từ đồng nghĩa (Paraphrasing) giữa lời thoại thực tế và phương án trắc nghiệm.',
    actionableStepVi:
      'Luyện tập ghi nhớ cặp từ đồng nghĩa thương mại (ví dụ: reschedule = change the date, out of stock = unavailable).',
    searchKeywords: [
      'Paraphrasing trong TOEIC Listening Part 3',
      'Từ vựng chuỗi cung ứng và dịch vụ khách hàng TOEIC',
      'Câu hỏi hành động tiếp theo What will the speaker do next',
    ],
    defaultArticleSlug: 'toeic-part3-4-workplace-conversations-and-talks',
  },
  LISTENING_ANNOUNCEMENT_TALK: {
    skill: 'LISTENING',
    partScope: 'P4',
    titleVi: 'Nghe thông báo, tin nhắn thoại & bản tin ngắn (Part 4)',
    descriptionVi:
      'Theo dõi mạch thông tin một chiều trong thông báo sân bay, lời nhắn thoại, hướng dẫn tham quan.',
    pedagogicalWeaknessVi:
      'Dễ bị mất mạch nghe khi bài nói chuyển sang phần yêu cầu hành động (Call-to-Action) ở cuối đoạn.',
    actionableStepVi:
      'Tập trung theo dõi cấu trúc 3 phần của bài nói ngắn: Bối cảnh mở đầu → Chi tiết thay đổi/sự cố → Yêu cầu người nghe thực hiện.',
    searchKeywords: [
      'Chiến thuật nghe bài nói ngắn TOEIC Part 4 Short Talks',
      'Luyện nghe Voicemail và Announcement tiếng Anh',
      'Bắt từ khóa chuyển ý trong TOEIC Part 4',
    ],
    defaultArticleSlug: 'toeic-part3-4-workplace-conversations-and-talks',
  },
  GRAMMAR_WORD_FORMS_CLAUSE: {
    skill: 'READING',
    partScope: 'P5',
    titleVi: 'Ngữ pháp: Từ loại (Word Forms), Đại từ & Mệnh đề (Part 5)',
    descriptionVi:
      'Xác định vị trí danh từ, động từ, tính từ, trạng từ, đại từ phản thân và mệnh đề quan hệ.',
    pedagogicalWeaknessVi:
      'Nhầm lẫn hậu tố từ loại (danh từ/tính từ/trạng từ) hoặc cấu trúc rút gọn mệnh đề quan hệ trong câu phức.',
    actionableStepVi:
      'Ôn tập hệ thống hậu tố từ loại (-tion, -ment, -ive, -al, -ly) và phân tích cấu trúc Chủ ngữ – Động từ chính trước khi nhìn đáp án.',
    searchKeywords: [
      'Ngữ pháp từ loại Word Forms TOEIC Part 5',
      'Mệnh đề quan hệ và rút gọn mệnh đề TOEIC',
      'Phân biệt đại từ và tính từ sở hữu tiếng Anh thương mại',
    ],
    defaultArticleSlug: 'toeic-part5-word-forms-and-clause-structure',
  },
  GRAMMAR_TENSE_VOICE_CONNECTORS: {
    skill: 'READING',
    partScope: 'P5',
    titleVi: 'Ngữ pháp: Thì động từ, Thể bị động, Giới từ & Liên từ (Part 5)',
    descriptionVi:
      'Phân biệt thì hoàn thành, thể bị động, câu điều kiện và liên từ phụ thuộc/giới từ chỉ nhượng bộ, nguyên nhân.',
    pedagogicalWeaknessVi:
      'Chưa phân biệt chắc chắn giữa liên từ đi với mệnh đề (although, because, while) và giới từ đi với cụm danh từ (despite, due to, during).',
    actionableStepVi:
      'Lập bảng đối chiếu Liên từ vs. Giới từ và kiểm tra sự hòa hợp chủ ngữ – động từ (chủ động/bị động) trong câu.',
    searchKeywords: [
      'Phân biệt Liên từ và Giới từ TOEIC Part 5 (Although vs Despite)',
      'Thì động từ và Thể bị động trong tiếng Anh công sở',
      'Cấu trúc câu điều kiện và phân từ TOEIC',
    ],
    defaultArticleSlug: 'toeic-part5-tense-passive-and-connectors',
  },
  VOCAB_BUSINESS_COLLOCATION: {
    skill: 'READING',
    partScope: 'P5',
    titleVi: 'Từ vựng thương mại & Cụm từ cố định Collocations (Part 5)',
    descriptionVi:
      'Chọn đúng từ vựng theo ngữ cảnh hợp đồng, tài chính, nhân sự và các cụm từ cố định (Collocations).',
    pedagogicalWeaknessVi:
      'Vốn từ vựng theo ngữ cảnh chuyên ngành (hợp đồng, bảo hành, kiểm toán, tuyển dụng) còn hạn chế khi gặp các từ gần nghĩa.',
    actionableStepVi:
      'Học từ vựng theo cụm Collocation công sở (ví dụ: comply with regulations, submit a reimbursement, extend a warranty).',
    searchKeywords: [
      'Collocations thương mại thường gặp trong TOEIC Part 5 & 6',
      'Từ vựng tiếng Anh văn phòng theo chủ đề Nhân sự & Tài chính',
      'Phân biệt các động từ gần nghĩa trong TOEIC Reading',
    ],
    defaultArticleSlug: 'toeic-part5-word-forms-and-clause-structure',
  },
  READING_TEXT_COHESION: {
    skill: 'READING',
    partScope: 'P6',
    titleVi: 'Đọc điền khuyết đoạn văn & Liên kết mạch văn (Part 6)',
    descriptionVi:
      'Điền từ vựng, ngữ pháp theo ngữ cảnh đoạn văn và chọn câu hoàn chỉnh khớp mạch logic trước–sau.',
    pedagogicalWeaknessVi:
      'Khi điền câu vào chỗ trống trong Part 6, chưa kết nối chặt các từ chuyển ý (Therefore, However, For this reason) với câu liền trước.',
    actionableStepVi:
      'Đọc câu trước và câu sau chỗ trống để xác định đại từ thay thế (this, these, such) và quan hệ nhân quả trước khi chọn câu.',
    searchKeywords: [
      'Chiến thuật điền câu vào đoạn văn TOEIC Part 6 Sentence Insertion',
      'Từ nối liên kết mạch văn Cohesion trong Email công sở',
      'Luyện đọc Memo và Customer Notice TOEIC Part 6',
    ],
    defaultArticleSlug: 'toeic-part6-7-passage-cohesion-and-multi-passage-reading',
  },
  READING_SINGLE_PASSAGE_DETAIL: {
    skill: 'READING',
    partScope: 'P7',
    titleVi: 'Đọc hiểu chi tiết Email, Thông báo & Biểu mẫu đơn (Part 7)',
    descriptionVi:
      'Đọc lướt (Skimming) tìm mục đích văn bản và đọc quét (Scanning) xác định chi tiết trong văn bản đơn.',
    pedagogicalWeaknessVi:
      'Tốc độ định vị thông tin chi tiết và câu hỏi phủ định (NOT true) trong email/thông báo đơn còn chậm.',
    actionableStepVi:
      'Luyện kỹ năng Scanning theo mốc thời gian, tên riêng, số tiền và đọc kỹ các điều khoản lưu ý ở cuối thông báo.',
    searchKeywords: [
      'Kỹ năng Skimming và Scanning trong TOEIC Part 7 Single Passages',
      'Cách xử lý câu hỏi NOT/TRUE và Inference trong Part 7',
      'Đọc hiểu Email và Thông báo nội bộ tiếng Anh',
    ],
    defaultArticleSlug: 'toeic-part6-7-passage-cohesion-and-multi-passage-reading',
  },
  READING_MULTI_PASSAGE_SYNTHESIS: {
    skill: 'READING',
    partScope: 'P7',
    titleVi: 'Đọc hiểu tổng hợp & đối chiếu đa văn bản (Part 7 Double/Triple)',
    descriptionVi:
      'Kết nối và đối chiếu thông tin chéo giữa 2–3 văn bản (Email + Lịch trình + Hóa đơn/Quy định).',
    pedagogicalWeaknessVi:
      'Gặp khó khăn khi phải tổng hợp dữ kiện nằm rải rác ở 2 văn bản khác nhau (Cross-reference questions) và quản lý thời gian cuối bài.',
    actionableStepVi:
      'Xác định điểm chung giữa các văn bản (mã đơn hàng, tên sự kiện, ngày tháng) và phân bổ tối đa 1 phút cho mỗi câu đa văn bản.',
    searchKeywords: [
      'Phương pháp làm bài Double & Triple Passages TOEIC Part 7',
      'Kỹ thuật đối chiếu thông tin chéo Cross-referencing Part 7',
      'Quản lý thời gian 75 phút TOEIC Reading',
    ],
    defaultArticleSlug: 'toeic-part6-7-passage-cohesion-and-multi-passage-reading',
  },
  SPEAKING_PRONUNCIATION_DESCRIPTION: {
    skill: 'SPEAKING',
    partScope: 'SPEAKING_TASK',
    titleVi: 'Nói: Phát âm, Ngữ điệu & Mô tả tranh (Speaking Q1–4)',
    descriptionVi:
      'Đọc to văn bản đúng trọng âm/ngữ điệu và mô tả bức tranh theo bố cục tổng quan – chi tiết.',
    pedagogicalWeaknessVi:
      'Cần cải thiện độ rõ của phụ âm cuối, nhịp ngắt cụm giới từ và khung cấu trúc mô tả tranh trong 30 giây.',
    actionableStepVi:
      'Luyện đọc to thông báo theo cụm ý (Chunking) và áp dụng công thức 4 câu mô tả tranh (Bối cảnh → Nhân vật chính → Hành động → Nền phía sau).',
    searchKeywords: [
      'TOEIC Speaking Read Aloud phát âm và ngữ điệu',
      'Cấu trúc mô tả tranh Describe a Picture trong 30 giây',
    ],
    defaultArticleSlug: 'toeic-speaking-writing-workplace-rubric-guide',
  },
  SPEAKING_INTERACTION_SOLUTION: {
    skill: 'SPEAKING',
    partScope: 'SPEAKING_TASK',
    titleVi: 'Nói: Phản xạ tình huống, Lịch biểu & Đề xuất giải pháp (Speaking Q5–11)',
    descriptionVi:
      'Trả lời phỏng vấn ngắn, tra cứu bảng thông tin sự kiện và đề xuất giải pháp cho vấn đề công sở.',
    pedagogicalWeaknessVi:
      'Cần tăng tốc độ triển khai ý tưởng và đưa ra giải pháp cụ thể có lý do bảo vệ quan điểm trong 30–60 giây.',
    actionableStepVi:
      'Sử dụng khung trả lời 3 bước: Xác nhận vấn đề (Acknowledge) → Đề xuất phương án (Propose Action) → Nêu lợi ích/lập luận (Justify).',
    searchKeywords: [
      'TOEIC Speaking Respond to Questions using Information',
      'Khung trả lời Propose a Solution và Express an Opinion',
    ],
    defaultArticleSlug: 'toeic-speaking-writing-workplace-rubric-guide',
  },
  WRITING_SENTENCE_EMAIL: {
    skill: 'WRITING',
    partScope: 'WRITING_TASK',
    titleVi: 'Viết: Đặt câu theo tranh & Phản hồi Email công việc (Writing Q1–7)',
    descriptionVi:
      'Viết câu hoàn chỉnh sử dụng cặp từ cho sẵn và soạn email công sở giải quyết đủ 3 yêu cầu trong đề.',
    pedagogicalWeaknessVi:
      'Cần đảm bảo viết đúng ngữ pháp câu phức với từ gợi ý và trả lời đầy đủ tất cả yêu cầu (bullet tasks) trong email.',
    actionableStepVi:
      'Luyện mẫu email công sở chuẩn (Opening → Trả lời đủ 3 yêu cầu trong đề → Closing chuyên nghiệp) trong 10 phút.',
    searchKeywords: [
      'Cách viết Email công sở TOEIC Writing Respond to a Written Request',
      'Đặt câu theo tranh với từ cho sẵn TOEIC Writing Q1-5',
    ],
    defaultArticleSlug: 'toeic-speaking-writing-workplace-rubric-guide',
  },
  WRITING_OPINION_ESSAY: {
    skill: 'WRITING',
    partScope: 'WRITING_TASK',
    titleVi: 'Viết: Bài luận trình bày quan điểm (Writing Q8)',
    descriptionVi:
      'Viết bài luận 300 từ trình bày quan điểm rõ ràng, có luận điểm và ví dụ thực tế nơi làm việc.',
    pedagogicalWeaknessVi:
      'Cần phát triển đoạn thân bài có ví dụ minh họa cụ thể và sử dụng đa dạng cấu trúc câu/từ nối học thuật.',
    actionableStepVi:
      'Lập dàn ý 4 đoạn (Mở bài nêu quan điểm → Luận điểm 1 + Ví dụ → Luận điểm 2 + Ví dụ → Kết luận) trước khi viết.',
    searchKeywords: [
      'Cấu trúc bài luận Opinion Essay TOEIC Writing Question 8',
      'Từ nối lập luận và ví dụ trong tiếng Anh thương mại',
    ],
    defaultArticleSlug: 'toeic-speaking-writing-workplace-rubric-guide',
  },
  UNCLASSIFIED: {
    skill: 'UNCLASSIFIED',
    partScope: 'UNCLASSIFIED',
    titleVi: 'Chưa phân loại kiến thức',
    descriptionVi:
      'Các câu hỏi chưa gắn nhãn chủ điểm kiến thức đã kiểm duyệt; chỉ ghi nhận số câu đúng theo Part.',
    pedagogicalWeaknessVi:
      'Hệ thống không tự suy diễn điểm yếu chuyên đề đối với các câu hỏi chưa có nhãn kiến thức được phê duyệt.',
    actionableStepVi:
      'Tham khảo kết quả tổng quan theo Part hoặc liên hệ giảng viên/cố vấn học tập để được rà soát chi tiết.',
    searchKeywords: ['Lộ trình ôn tập TOEIC tổng quát Listening & Reading'],
  },
};

const DIFFICULTY_LABELS: Record<DifficultyBandCode, string> = {
  A2_FOUNDATION: 'Mức Cơ bản (CEFR A2 / Foundation)',
  B1_INTERMEDIATE: 'Mức Trung cấp (CEFR B1 / Intermediate)',
  B2_ADVANCED: 'Mức Nâng cao (CEFR B2 / Advanced)',
  UNAVAILABLE: 'Chưa phân mức độ khó',
};

let cachedManifestLookup: {
  byStem: Map<string, ManifestQuestionMeta>;
  byPartOrder: Map<string, ManifestQuestionMeta>;
} | null = null;

function getManifestLookup() {
  if (cachedManifestLookup) return cachedManifestLookup;
  const byStem = new Map<string, ManifestQuestionMeta>();
  const byPartOrder = new Map<string, ManifestQuestionMeta>();
  try {
    const contentDir = path.resolve(__dirname, '../../../content/se-original-v1');
    const lrPath = path.join(contentDir, 'SE_LR_200_Manifest.json');
    if (fs.existsSync(lrPath)) {
      const lr = JSON.parse(fs.readFileSync(lrPath, 'utf8')) as {
        groups: {
          skill: 'LISTENING' | 'READING';
          partNumber: number;
          taskCode: string;
          questions: {
            code: string;
            partNumber: number;
            difficulty?: 'A2' | 'B1' | 'B2';
            topicTag?: string;
            stem: string;
          }[];
        }[];
      };
      const partCounters: Record<string, number> = {};
      for (const g of lr.groups) {
        const partCode = `P${g.partNumber}`;
        for (const q of g.questions) {
          const idx = partCounters[partCode] ?? 0;
          partCounters[partCode] = idx + 1;
          const meta: ManifestQuestionMeta = {
            code: q.code,
            skill: g.skill,
            partCode,
            partNumber: q.partNumber,
            difficulty: q.difficulty ?? null,
            topicTag: q.topicTag ?? null,
          };
          byStem.set(q.stem.trim(), meta);
          byPartOrder.set(`${g.skill}:${partCode}:${idx}`, meta);
        }
      }
    }
    const swPath = path.join(contentDir, 'SE_SW_19_Manifest.json');
    if (fs.existsSync(swPath)) {
      const sw = JSON.parse(fs.readFileSync(swPath, 'utf8')) as {
        speakingTasks?: {
          itemCode: string;
          partNumber: number;
          groupTaskCode: string;
          difficulty?: 'A2' | 'B1' | 'B2';
          topicTag?: string;
          promptText: string;
        }[];
        writingTasks?: {
          itemCode: string;
          partNumber: number;
          groupTaskCode: string;
          difficulty?: 'A2' | 'B1' | 'B2';
          topicTag?: string;
          promptText: string;
        }[];
      };
      for (const s of sw.speakingTasks ?? []) {
        byStem.set(s.promptText.trim(), {
          code: s.itemCode,
          skill: 'SPEAKING',
          partCode: s.groupTaskCode,
          partNumber: s.partNumber,
          difficulty: s.difficulty ?? null,
          topicTag: s.topicTag ?? null,
        });
      }
      for (const w of sw.writingTasks ?? []) {
        byStem.set(w.promptText.trim(), {
          code: w.itemCode,
          skill: 'WRITING',
          partCode: w.groupTaskCode,
          partNumber: w.partNumber,
          difficulty: w.difficulty ?? null,
          topicTag: w.topicTag ?? null,
        });
      }
    }
  } catch {
    // Fallback gracefully if manifest files are not on disk in an isolated environment
  }
  cachedManifestLookup = { byStem, byPartOrder };
  return cachedManifestLookup;
}

export function normalizeCanonicalPartCode(
  taskCode: string | null | undefined,
  skill: string,
): string {
  const match = /^(?:LR-)?(P[1-7])$/i.exec(taskCode?.trim() ?? '');
  if (match) return match[1].toUpperCase();
  return taskCode?.trim() || skill;
}

export function mapTopicTagToKnowledgeDomain(
  topicTag: string | null | undefined,
  skill: string,
  partCode: string,
): KnowledgeDomainCode {
  if (!topicTag || !topicTag.trim()) return 'UNCLASSIFIED';
  const tag = topicTag.trim().toUpperCase();
  if (tag === 'UNCLASSIFIED' || tag === 'UNTAGGED' || tag === 'MISSING_TAG') return 'UNCLASSIFIED';
  if (tag in KNOWLEDGE_DOMAIN_CATALOG) return tag as KnowledgeDomainCode;
  if (tag.startsWith('P1_')) return 'LISTENING_VISUAL_ACTION';
  if (tag.startsWith('P2_')) {
    if (
      /YES_NO|INDIRECT|REQUEST|CHOICE|TAG_QUESTION|NEGATIVE|STATEMENT|OFFER|SUGGESTION|PERMISSION/.test(
        tag,
      )
    ) {
      return 'LISTENING_INDIRECT_RESPONSE';
    }
    return 'LISTENING_WH_DIRECT';
  }
  if (tag.startsWith('P3_')) {
    if (/RETAIL|SHIPPING|MARKETING|HOTEL|MANUFACTURING|LIBRARY/.test(tag)) {
      return 'LISTENING_SERVICE_LOGISTICS';
    }
    return 'LISTENING_WORKPLACE_CONVERSATION';
  }
  if (tag.startsWith('P4_')) return 'LISTENING_ANNOUNCEMENT_TALK';
  if (tag.startsWith('P5_')) {
    if (/VOCABULARY|COLLOCATION|LEXICAL/.test(tag)) return 'VOCAB_BUSINESS_COLLOCATION';
    if (
      /VERB_TENSE|PASSIVE|VERB_VOICE|CONDITIONAL|GERUND|INFINITIVE|PARTICIPLE|PREPOSITION|CONJUNCTION/.test(
        tag,
      )
    ) {
      return 'GRAMMAR_TENSE_VOICE_CONNECTORS';
    }
    return 'GRAMMAR_WORD_FORMS_CLAUSE';
  }
  if (tag.startsWith('P6_')) return 'READING_TEXT_COHESION';
  if (tag.startsWith('P7_')) {
    if (/DOUBLE|TRIPLE|MULTI/.test(tag)) return 'READING_MULTI_PASSAGE_SYNTHESIS';
    return 'READING_SINGLE_PASSAGE_DETAIL';
  }
  if (skill === 'SPEAKING') {
    if (/READ_ALOUD|PICTURE/.test(tag)) return 'SPEAKING_PRONUNCIATION_DESCRIPTION';
    return 'SPEAKING_INTERACTION_SOLUTION';
  }
  if (skill === 'WRITING') {
    if (/OPINION|ESSAY/.test(tag)) return 'WRITING_OPINION_ESSAY';
    return 'WRITING_SENTENCE_EMAIL';
  }
  if (partCode === 'P1') return 'LISTENING_VISUAL_ACTION';
  if (partCode === 'P2') return 'LISTENING_WH_DIRECT';
  if (partCode === 'P3') return 'LISTENING_WORKPLACE_CONVERSATION';
  if (partCode === 'P4') return 'LISTENING_ANNOUNCEMENT_TALK';
  if (partCode === 'P5') return 'GRAMMAR_WORD_FORMS_CLAUSE';
  if (partCode === 'P6') return 'READING_TEXT_COHESION';
  if (partCode === 'P7') return 'READING_SINGLE_PASSAGE_DETAIL';
  return 'UNCLASSIFIED';
}

function mapDifficultyBand(raw: string | null | undefined): DifficultyBandCode {
  if (!raw) return 'UNAVAILABLE';
  const upper = raw.trim().toUpperCase();
  if (upper === 'A2' || upper === 'EASY' || upper === 'A2_FOUNDATION') return 'A2_FOUNDATION';
  if (upper === 'B1' || upper === 'MEDIUM' || upper === 'B1_INTERMEDIATE') return 'B1_INTERMEDIATE';
  if (upper === 'B2' || upper === 'C1' || upper === 'HARD' || upper === 'B2_ADVANCED')
    return 'B2_ADVANCED';
  return 'UNAVAILABLE';
}

function extractInlineTagMarker(
  content: string,
  groupTitle: string | null,
): {
  topicTag: string | null;
  difficulty: string | null;
} {
  const combined = `${groupTitle ?? ''} ${content}`;
  const tagMatch = /\[TAG:([A-Z0-9_]+)\]/i.exec(combined);
  const diffMatch = /\[DIFF:(A2|B1|B2|EASY|MEDIUM|HARD)\]/i.exec(combined);
  return {
    topicTag: tagMatch ? tagMatch[1].toUpperCase() : null,
    difficulty: diffMatch ? diffMatch[1].toUpperCase() : null,
  };
}

export interface DbQuestionMetadataMap {
  [testQuestionId: string]: {
    topicTag?: string | null;
    difficulty?: string | null;
    linkedArticleSlugs?: string[];
  };
}

export function buildPlacementStructuredDiagnosis(input: {
  snapshot: PlacementSnapshot;
  sourceDigest: string;
  answers: {
    testQuestionId: string;
    selectedOptionIds: string[];
    textResponse?: string | null;
    audioStorageKey?: string | null;
  }[];
  lrPublished: boolean;
  speakingEvaluation?: {
    body: {
      total?: number;
      samples?: number;
      scale?: string;
      scores?: Record<string, { code: string; score: number; feedback?: string }[]>;
    };
  } | null;
  writingEvaluation?: {
    body: {
      total?: number;
      samples?: number;
      scale?: string;
      scores?: Record<string, { code: string; score: number; feedback?: string }[]>;
    };
  } | null;
  dbQuestionMeta?: DbQuestionMetadataMap;
  minSamplesThreshold?: number;
}): PlacementStructuredDiagnosis {
  const minSamples = input.minSamplesThreshold ?? 3;
  const lookup = getManifestLookup();
  const isFull200Blueprint =
    input.snapshot.groups
      .filter((g) => ['LISTENING', 'READING'].includes(g.skill))
      .reduce((acc, g) => acc + g.questions.length, 0) === 200;

  const partBuckets = new Map<
    string,
    {
      part: string;
      partNumber: number | null;
      skill: string;
      titleVi: string;
      descriptionVi: string;
      samples: number;
      answered: number;
      correct: number;
    }
  >();

  const domainBuckets = new Map<
    KnowledgeDomainCode,
    {
      domainCode: KnowledgeDomainCode;
      skill: string;
      partScopes: Set<string>;
      samples: number;
      answered: number;
      correct: number;
      observedTopicTags: Set<string>;
      linkedArticleSlugs: Set<string>;
    }
  >();

  const difficultyBuckets = new Map<
    DifficultyBandCode,
    {
      bandCode: DifficultyBandCode;
      samples: number;
      answered: number;
      correct: number;
    }
  >();

  const partItemIndexCounter: Record<string, number> = {};
  let lrAnsweredCount = 0;
  let lrTotalItems = 0;
  let listeningCorrect = 0;
  let listeningSamples = 0;
  let readingCorrect = 0;
  let readingSamples = 0;

  for (const g of input.snapshot.groups) {
    if (!['LISTENING', 'READING'].includes(g.skill)) continue;
    const partCode = normalizeCanonicalPartCode(g.taskCode, g.skill);
    const pMeta = PART_METADATA[partCode];
    const partBucket = partBuckets.get(partCode) ?? {
      part: partCode,
      partNumber: pMeta?.partNumber ?? null,
      skill: g.skill,
      titleVi: pMeta?.titleVi ?? `${partCode} (${g.skill})`,
      descriptionVi: pMeta?.descriptionVi ?? 'Nhóm câu hỏi đánh giá kỹ năng tiếp nhận Nghe – Đọc.',
      samples: 0,
      answered: 0,
      correct: 0,
    };

    for (const q of g.questions) {
      lrTotalItems += 1;
      if (g.skill === 'LISTENING') listeningSamples += 1;
      if (g.skill === 'READING') readingSamples += 1;

      const partIdx = partItemIndexCounter[partCode] ?? 0;
      partItemIndexCounter[partCode] = partIdx + 1;

      const ans = input.answers.find((a) => a.testQuestionId === q.id);
      const isAnswered = !!ans && ans.selectedOptionIds.length > 0;
      if (isAnswered) lrAnsweredCount += 1;

      const correctOptionIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
      const isCorrect =
        correctOptionIds.length === 1 &&
        ans?.selectedOptionIds.length === 1 &&
        ans.selectedOptionIds[0] === correctOptionIds[0];

      partBucket.samples += 1;
      if (isAnswered) partBucket.answered += 1;
      if (input.lrPublished && isCorrect) {
        partBucket.correct += 1;
        if (g.skill === 'LISTENING') listeningCorrect += 1;
        if (g.skill === 'READING') readingCorrect += 1;
      }

      const inlineMeta = extractInlineTagMarker(q.content, g.title);
      const dbMeta = input.dbQuestionMeta?.[q.id];
      const stemMatch =
        lookup.byStem.get(q.content.trim()) ??
        (isFull200Blueprint
          ? lookup.byPartOrder.get(`${g.skill}:${partCode}:${partIdx}`)
          : undefined);

      const resolvedTopicTag =
        dbMeta?.topicTag ?? inlineMeta.topicTag ?? stemMatch?.topicTag ?? null;
      const resolvedDifficulty = mapDifficultyBand(
        inlineMeta.difficulty ?? stemMatch?.difficulty ?? dbMeta?.difficulty ?? null,
      );

      const domainCode = mapTopicTagToKnowledgeDomain(resolvedTopicTag, g.skill, partCode);
      const dBucket = domainBuckets.get(domainCode) ?? {
        domainCode,
        skill: g.skill,
        partScopes: new Set<string>(),
        samples: 0,
        answered: 0,
        correct: 0,
        observedTopicTags: new Set<string>(),
        linkedArticleSlugs: new Set<string>(),
      };
      dBucket.partScopes.add(partCode);
      dBucket.samples += 1;
      if (isAnswered) dBucket.answered += 1;
      if (input.lrPublished && isCorrect) dBucket.correct += 1;
      if (resolvedTopicTag && domainCode !== 'UNCLASSIFIED') {
        dBucket.observedTopicTags.add(resolvedTopicTag);
      }
      for (const slug of dbMeta?.linkedArticleSlugs ?? []) {
        dBucket.linkedArticleSlugs.add(slug);
      }
      const defaultSlug = KNOWLEDGE_DOMAIN_CATALOG[domainCode]?.defaultArticleSlug;
      if (defaultSlug) dBucket.linkedArticleSlugs.add(defaultSlug);
      domainBuckets.set(domainCode, dBucket);

      const diffBucket = difficultyBuckets.get(resolvedDifficulty) ?? {
        bandCode: resolvedDifficulty,
        samples: 0,
        answered: 0,
        correct: 0,
      };
      diffBucket.samples += 1;
      if (isAnswered) diffBucket.answered += 1;
      if (input.lrPublished && isCorrect) diffBucket.correct += 1;
      difficultyBuckets.set(resolvedDifficulty, diffBucket);
    }

    partBuckets.set(partCode, partBucket);
  }

  const partBreakdown: PartDiagnosticRow[] = [...partBuckets.values()]
    .sort((a, b) => (a.partNumber ?? 99) - (b.partNumber ?? 99) || a.part.localeCompare(b.part))
    .map((p) => {
      const wrong = input.lrPublished ? Math.max(0, p.answered - p.correct) : 0;
      const unanswered = Math.max(0, p.samples - p.answered);
      const answeredAccuracyPct =
        input.lrPublished && p.answered > 0 ? Math.round((p.correct / p.answered) * 100) : null;
      const accuracyPct =
        input.lrPublished && p.samples > 0 ? Math.round((p.correct / p.samples) * 100) : null;
      const sufficiency: SampleSufficiency =
        !input.lrPublished || p.samples === 0
          ? 'NO_EVIDENCE'
          : p.samples < minSamples
            ? 'LOW_SAMPLE'
            : 'SUFFICIENT';
      const statusLabel =
        sufficiency === 'NO_EVIDENCE'
          ? 'Đang chờ công bố kết quả chấm'
          : sufficiency === 'LOW_SAMPLE'
            ? `Còn ít câu hỏi (${p.samples}/${minSamples} câu) nên chưa đánh giá sâu`
            : p.answered === 0
              ? `Chưa trả lời câu nào (${p.samples} câu bỏ trống)`
              : p.answered < minSamples
                ? `Mới làm ${p.answered}/${p.samples} câu (${wrong > 0 ? `sai ${wrong} câu` : `đúng ${p.correct} câu`})`
                : accuracyPct! >= 75
                  ? 'Nền tảng vững'
                  : accuracyPct! >= 55
                    ? 'Khá ổn — nên luyện thêm'
                    : unanswered > p.answered
                      ? `Chưa làm đủ phần này (Đúng ${p.correct}, Sai ${wrong}, Bỏ trống ${unanswered})`
                      : `Cần tập trung cải thiện (Sai ${wrong}/${p.answered} câu)`;
      return {
        part: p.part,
        partNumber: p.partNumber,
        skill: p.skill,
        titleVi: p.titleVi,
        descriptionVi: p.descriptionVi,
        samples: p.samples,
        answered: p.answered,
        correct: input.lrPublished ? p.correct : 0,
        wrong,
        unanswered,
        answeredAccuracyPct,
        accuracyPct,
        minSamplesRequired: minSamples,
        sufficiency,
        statusLabel,
        canClaimWeakness: sufficiency === 'SUFFICIENT',
      };
    });

  const knowledgeBreakdown: KnowledgeDomainDiagnosticRow[] = [...domainBuckets.values()].map(
    (d) => {
      const cat = KNOWLEDGE_DOMAIN_CATALOG[d.domainCode];
      const wrong = input.lrPublished ? Math.max(0, d.answered - d.correct) : 0;
      const unanswered = Math.max(0, d.samples - d.answered);
      const answeredAccuracyPct =
        input.lrPublished && d.answered > 0 ? Math.round((d.correct / d.answered) * 100) : null;
      const accuracyPct =
        input.lrPublished && d.samples > 0 ? Math.round((d.correct / d.samples) * 100) : null;
      const sufficiency: SampleSufficiency =
        d.domainCode === 'UNCLASSIFIED'
          ? 'UNCLASSIFIED_TAG'
          : !input.lrPublished || d.samples === 0
            ? 'NO_EVIDENCE'
            : d.samples < minSamples
              ? 'LOW_SAMPLE'
              : 'SUFFICIENT';
      const statusLabel =
        sufficiency === 'UNCLASSIFIED_TAG'
          ? 'Chưa phân loại kiến thức'
          : sufficiency === 'NO_EVIDENCE'
            ? 'Đang chờ công bố kết quả chấm'
            : sufficiency === 'LOW_SAMPLE'
              ? `Còn ít câu hỏi (${d.samples}/${minSamples} câu)`
              : d.answered === 0
                ? `Chưa trả lời câu nào (${d.samples} câu bỏ trống)`
                : d.answered < minSamples
                  ? `Mới làm ${d.answered}/${d.samples} câu (${wrong > 0 ? `sai ${wrong}` : `đúng ${d.correct}`})`
                  : accuracyPct! >= 75
                    ? 'Làm rất tốt'
                    : accuracyPct! >= 55
                      ? 'Tạm ổn — cần luyện thêm'
                      : unanswered > d.answered
                        ? `Chưa hoàn thành đủ (Đúng ${d.correct}, Sai ${wrong}, Bỏ trống ${unanswered})`
                        : `Cần ôn lại ngay (Sai ${wrong}/${d.answered} câu)`;
      return {
        domainCode: d.domainCode,
        skill: d.skill,
        partScope: [...d.partScopes].join(', '),
        titleVi: cat.titleVi,
        descriptionVi: cat.descriptionVi,
        samples: d.samples,
        answered: d.answered,
        correct: input.lrPublished ? d.correct : 0,
        wrong,
        unanswered,
        answeredAccuracyPct,
        accuracyPct,
        minSamplesRequired: minSamples,
        sufficiency,
        statusLabel,
        canClaimWeakness: sufficiency === 'SUFFICIENT' && d.domainCode !== 'UNCLASSIFIED',
        observedTopicTags: [...d.observedTopicTags],
        linkedArticleSlugs: [...d.linkedArticleSlugs],
      };
    },
  );

  const difficultyOrder: DifficultyBandCode[] = [
    'A2_FOUNDATION',
    'B1_INTERMEDIATE',
    'B2_ADVANCED',
    'UNAVAILABLE',
  ];
  const difficultyBreakdown: DifficultyDiagnosticRow[] = difficultyOrder
    .filter((code) => difficultyBuckets.has(code))
    .map((code) => {
      const b = difficultyBuckets.get(code)!;
      const accuracyPct =
        input.lrPublished && b.samples > 0 && code !== 'UNAVAILABLE'
          ? Math.round((b.correct / b.samples) * 100)
          : null;
      const sufficiency: SampleSufficiency =
        code === 'UNAVAILABLE'
          ? 'UNCLASSIFIED_TAG'
          : !input.lrPublished || b.samples === 0
            ? 'NO_EVIDENCE'
            : b.samples < minSamples
              ? 'LOW_SAMPLE'
              : 'SUFFICIENT';
      return {
        bandCode: code,
        titleVi: DIFFICULTY_LABELS[code],
        samples: b.samples,
        answered: b.answered,
        correct: input.lrPublished ? b.correct : 0,
        accuracyPct,
        sufficiency,
        statusLabel:
          code === 'UNAVAILABLE'
            ? 'Chưa phân mức độ khó'
            : sufficiency === 'LOW_SAMPLE'
              ? `Ít câu hỏi (${b.samples} câu)`
              : accuracyPct !== null
                ? `Đạt ${b.correct}/${b.samples} câu (${accuracyPct}%)`
                : 'Đang chờ công bố',
      };
    });

  const sufficientDomains = knowledgeBreakdown.filter(
    (k) =>
      k.sufficiency === 'SUFFICIENT' && k.domainCode !== 'UNCLASSIFIED' && k.accuracyPct !== null,
  );

  const strengths: CompetencyHighlight[] = [...sufficientDomains]
    .filter((k) => k.accuracyPct! >= 65)
    .sort((a, b) => b.accuracyPct! - a.accuracyPct! || b.samples - a.samples)
    .slice(0, 3)
    .map((k, idx) => ({
      rank: idx + 1,
      kind: 'STRENGTH',
      domainCode: k.domainCode,
      partScope: k.partScope,
      skill: k.skill,
      titleVi: k.titleVi,
      correct: k.correct,
      samples: k.samples,
      accuracyPct: k.accuracyPct!,
      evidenceBadge: `Đúng ${k.correct}/${k.samples} câu (${k.accuracyPct}%) — Nền tảng vững`,
      pedagogicalSummary: `Bạn làm tốt phần ${k.titleVi.toLowerCase()} (đúng ${k.correct}/${k.samples} câu, đạt ${k.accuracyPct}%).`,
      actionableStep:
        'Duy trì phản xạ qua các bài luyện tổng hợp nâng cao và tập trung thời gian cho các nhóm kỹ năng còn yếu hơn.',
    }));

  const candidateWeakDomains = sufficientDomains.filter(
    (k) => k.accuracyPct! < 65 && k.canClaimWeakness,
  );
  const answeredWrongDomains = candidateWeakDomains.filter(
    (k) => k.answered > 0 && k.correct < k.answered,
  );
  const improvements: CompetencyHighlight[] = (
    answeredWrongDomains.length > 0 ? answeredWrongDomains : candidateWeakDomains
  )
    .sort(
      (a, b) =>
        (a.answeredAccuracyPct ?? a.accuracyPct ?? 0) -
          (b.answeredAccuracyPct ?? b.accuracyPct ?? 0) ||
        b.answered - a.answered ||
        b.samples - a.samples,
    )
    .slice(0, 3)
    .map((k, idx) => {
      const cat = KNOWLEDGE_DOMAIN_CATALOG[k.domainCode];
      const kWrong = Math.max(0, k.answered - k.correct);
      const kSkip = Math.max(0, k.samples - k.answered);
      return {
        rank: idx + 1,
        kind: 'IMPROVEMENT_PRIORITY',
        domainCode: k.domainCode,
        partScope: k.partScope,
        skill: k.skill,
        titleVi: k.titleVi,
        correct: k.correct,
        samples: k.samples,
        accuracyPct: k.accuracyPct!,
        evidenceBadge:
          kSkip > 0
            ? `Làm ${k.answered}/${k.samples} câu · Đúng ${k.correct}, Sai ${kWrong} — Cần ưu tiên #${idx + 1}`
            : `Đúng ${k.correct}/${k.samples} câu (${k.accuracyPct}%) — Cần ưu tiên #${idx + 1}`,
        pedagogicalSummary: cat.pedagogicalWeaknessVi,
        actionableStep: cat.actionableStepVi,
      };
    });

  const lowSampleNotes: string[] = [];
  for (const p of partBreakdown.filter((x) => x.sufficiency === 'LOW_SAMPLE')) {
    lowSampleNotes.push(
      `${p.titleVi}: phần này chỉ có ${p.samples} câu (dưới ${minSamples} câu) nên hệ thống chưa kết luận vội.`,
    );
  }
  for (const k of knowledgeBreakdown.filter((x) => x.sufficiency === 'UNCLASSIFIED_TAG')) {
    lowSampleNotes.push(
      `Có ${k.samples} câu hỏi chưa gắn chủ đề cụ thể; hệ thống vẫn tính đúng/sai theo từng Part bình thường.`,
    );
  }

  const productiveSkills: ProductiveSkillDiagnostic[] = [];
  if (input.snapshot.mode === 'FOUR_SKILLS') {
    for (const skill of ['SPEAKING', 'WRITING'] as const) {
      const groups = input.snapshot.groups.filter((g) => g.skill === skill);
      const ev = skill === 'SPEAKING' ? input.speakingEvaluation : input.writingEvaluation;
      if (!ev) {
        productiveSkills.push({
          skill,
          status: 'PENDING_REVIEW',
          statusLabel: 'ĐANG CHẤM — Chờ giảng viên chấm theo Rubric',
          totalScore: null,
          maxPossibleScore: null,
          taskCount: groups.length,
          scaleLabel: null,
          criteriaBreakdown: [],
          pendingNotice: `Bài làm ${skill === 'SPEAKING' ? 'Nói (Speaking)' : 'Viết (Writing)'} gồm ${groups.length} nhiệm vụ đã được lưu nhận và đang chờ giảng viên chấm theo Rubric độc lập. Trạng thái đang chờ chấm hoàn toàn không tính là 0 điểm.`,
        });
      } else {
        const criteriaBreakdown: ProductiveSkillCriterionSummary[] = [];
        for (const g of groups) {
          const groupScores = ev.body.scores?.[g.id] ?? [];
          for (const c of groupScores) {
            criteriaBreakdown.push({
              taskGroupId: g.id,
              taskTitle: g.title ?? g.taskCode ?? skill,
              code: c.code,
              score: Number(c.score),
              maxScore: null,
              feedbackText: c.feedback ?? '',
            });
          }
        }
        productiveSkills.push({
          skill,
          status: 'PUBLISHED',
          statusLabel: 'Đã chấm Rubric & Công bố độc lập',
          totalScore: ev.body.total !== undefined ? Number(ev.body.total) : null,
          maxPossibleScore: null,
          taskCount: groups.length,
          scaleLabel: ev.body.scale ?? 'INTERNAL_RUBRIC_POINTS',
          criteriaBreakdown,
          pendingNotice: null,
        });
      }
    }
  }

  const limitations: string[] = [
    'Kết quả này là chẩn đoán năng lực đầu vào nội bộ để xếp lớp và định hướng học tập tại Smart English; không phải phiếu điểm chứng chỉ TOEIC quốc tế chính thức.',
  ];
  if (!input.lrPublished) {
    limitations.push('Kết quả Nghe – Đọc đang chờ Học vụ kiểm duyệt và công bố độc lập.');
  }
  if (
    input.snapshot.mode === 'FOUR_SKILLS' &&
    (!input.speakingEvaluation || !input.writingEvaluation)
  ) {
    limitations.push(
      'Bài thi 4 kỹ năng đang chờ giảng viên hoàn tất chấm Speaking/Writing theo Rubric; hệ thống không cộng gộp điểm giả định và giữ trạng thái sơ bộ cho đến khi công bố đủ 4 kỹ năng.',
    );
  }
  if (lowSampleNotes.length > 0) {
    limitations.push(
      `Những chủ đề có dưới ${minSamples} câu hỏi hoặc chưa gắn nhãn được hiển thị trung lập để tránh đánh giá vội.`,
    );
  }

  const lrCorrectCount = input.lrPublished ? listeningCorrect + readingCorrect : null;
  const lrAccuracyPct =
    input.lrPublished && lrTotalItems > 0
      ? Math.round(((listeningCorrect + readingCorrect) / lrTotalItems) * 100)
      : null;
  const listeningAccuracyPct =
    input.lrPublished && listeningSamples > 0
      ? Math.round((listeningCorrect / listeningSamples) * 100)
      : null;
  const readingAccuracyPct =
    input.lrPublished && readingSamples > 0
      ? Math.round((readingCorrect / readingSamples) * 100)
      : null;

  let balanceState: PlacementStructuredDiagnosis['overallSummary']['balanceState'] =
    'PENDING_OR_LOW_SAMPLE';
  let balanceLabelVi = 'Chưa đủ dữ liệu mẫu để so sánh độ lệch giữa Nghe và Đọc.';
  if (
    input.lrPublished &&
    listeningSamples >= minSamples &&
    readingSamples >= minSamples &&
    listeningAccuracyPct !== null &&
    readingAccuracyPct !== null
  ) {
    const diff = listeningAccuracyPct - readingAccuracyPct;
    if (lrTotalItems >= 20 && lrAnsweredCount < Math.ceil(lrTotalItems * 0.5)) {
      balanceState = 'BALANCED';
      balanceLabelVi = `Bạn mới hoàn thành ${lrAnsweredCount} trên tổng số ${lrTotalItems} câu (Nghe đúng ${listeningCorrect} câu, Đọc đúng ${readingCorrect} câu). Các nhận xét bên dưới tách bạch rõ giữa phần bạn trả lời sai và phần bạn chưa kịp làm.`;
    } else if (diff >= 12) {
      balanceState = 'LISTENING_STRONGER';
      balanceLabelVi = `Kỹ năng Nghe (${listeningCorrect}/${listeningSamples} — ${listeningAccuracyPct}%) vượt trội hơn Kỹ năng Đọc (${readingCorrect}/${readingSamples} — ${readingAccuracyPct}%); cần ưu tiên bù đắp Ngữ pháp & Đọc hiểu Part 5–7.`;
    } else if (diff <= -12) {
      balanceState = 'READING_STRONGER';
      balanceLabelVi = `Kỹ năng Đọc (${readingCorrect}/${readingSamples} — ${readingAccuracyPct}%) vượt trội hơn Kỹ năng Nghe (${listeningCorrect}/${listeningSamples} — ${listeningAccuracyPct}%); cần ưu tiên luyện phản xạ Nghe Part 2–4.`;
    } else {
      balanceState = 'BALANCED';
      balanceLabelVi = `Hai kỹ năng Nghe (${listeningCorrect}/${listeningSamples} — ${listeningAccuracyPct}%) và Đọc (${readingCorrect}/${readingSamples} — ${readingAccuracyPct}%) phát triển đồng đều; phù hợp lộ trình tăng tốc tích hợp cả 2 kỹ năng.`;
    }
  }

  return {
    snapshotVersion: 'WAVE05_DIAG_V1',
    sourceDigestRef: input.sourceDigest.slice(0, 16),
    minSamplesThreshold: minSamples,
    overallSummary: {
      lrAnsweredCount,
      lrTotalItems,
      lrCorrectCount,
      lrAccuracyPct,
      listeningCorrect: input.lrPublished ? listeningCorrect : null,
      listeningSamples,
      listeningAccuracyPct,
      readingCorrect: input.lrPublished ? readingCorrect : null,
      readingSamples,
      readingAccuracyPct,
      balanceState,
      balanceLabelVi,
      internalScaleDisclosureVi:
        'Thang đo nội bộ dựa trên số câu trả lời đúng và ma trận kỹ năng thực tế của bài kiểm tra đầu vào; không quy đổi giả định sang thang điểm chứng chỉ quốc tế 990.',
    },
    partBreakdown,
    knowledgeBreakdown,
    difficultyBreakdown,
    productiveSkills,
    strengths,
    improvements,
    lowSampleNotes,
    limitations,
  };
}

export function buildSelfStudyGuidance(input: {
  diagnosis: PlacementStructuredDiagnosis;
  allowlistedArticles: {
    slug: string;
    title: string;
    skills: string[];
    part: number | null;
    revisionId?: string;
  }[];
}): SelfStudyGuidanceItem[] {
  const allowlistMap = new Map(input.allowlistedArticles.map((a) => [a.slug, a]));

  const weakDomains = input.diagnosis.knowledgeBreakdown
    .filter((k) => k.canClaimWeakness && k.accuracyPct !== null && k.accuracyPct < 65)
    .sort((a, b) => {
      const aHasErr = a.answered > 0 && a.correct < a.answered ? 0 : 1;
      const bHasErr = b.answered > 0 && b.correct < b.answered ? 0 : 1;
      if (aHasErr !== bHasErr) return aHasErr - bHasErr;
      return (
        (a.answeredAccuracyPct ?? a.accuracyPct!) - (b.answeredAccuracyPct ?? b.accuracyPct!) ||
        b.answered - a.answered ||
        b.samples - a.samples
      );
    })
    .slice(0, 5);

  const targetDomains: KnowledgeDomainDiagnosticRow[] =
    weakDomains.length > 0
      ? weakDomains
      : input.diagnosis.knowledgeBreakdown
          .filter((k) => k.domainCode !== 'UNCLASSIFIED' && k.samples > 0)
          .sort((a, b) => (a.accuracyPct ?? 100) - (b.accuracyPct ?? 100))
          .slice(0, 3);

  return targetDomains.map((d) => {
    const cat = KNOWLEDGE_DOMAIN_CATALOG[d.domainCode];
    const vettedResources: VettedStudyResource[] = [];
    for (const slug of d.linkedArticleSlugs) {
      const art = allowlistMap.get(slug);
      if (art) {
        vettedResources.push({
          slug: art.slug,
          revisionId: art.revisionId,
          title: art.title,
          path: `/knowledge/articles/${encodeURIComponent(art.slug)}`,
          kind: 'KNOWLEDGE_ARTICLE',
          verifiedSource: 'Thư viện Kiến thức Smart English',
        });
      }
    }

    const hasVetted = vettedResources.length > 0;
    const dWrong = Math.max(0, d.answered - d.correct);
    const dSkip = Math.max(0, d.samples - d.answered);
    return {
      domainCode: d.domainCode,
      partScope: d.partScope,
      skill: d.skill,
      topicTitleVi: d.titleVi,
      observedEvidence:
        d.accuracyPct !== null
          ? dSkip > 0
            ? d.answered > 0
              ? `Đã làm ${d.answered}/${d.samples} câu · Đúng ${d.correct}, Sai ${dWrong}, Bỏ trống ${dSkip}`
              : `Chưa làm câu nào (0/${d.samples} câu)`
            : `Đúng ${d.correct}/${d.samples} câu (${d.accuracyPct}%)`
          : `Có ${d.samples} câu hỏi — ${d.statusLabel}`,
      focusSummaryVi: `${cat.pedagogicalWeaknessVi} ${cat.actionableStepVi}`,
      searchKeywords: cat.searchKeywords,
      resourceStatus: hasVetted ? 'VETTED_AVAILABLE' : 'NO_VETTED_LINK',
      resourceStatusLabel: hasVetted
        ? `Có ${vettedResources.length} bài ôn tập gợi ý ngay bên dưới`
        : 'Chưa có tài liệu được xác thực cho chủ đề này',
      vettedResources,
    };
  });
}

export interface AiAdvisoryCustomProviderInput {
  attemptId?: string;
  diagnosis: PlacementStructuredDiagnosis;
  recommendation: PlacementStructuredRecommendation;
  selfStudyGuidance: SelfStudyGuidanceItem[];
  sanitizedLearnerContext: string;
}

export interface AiAdvisoryRawCandidate {
  fragments?: AdviceFragments;
  diagnosisAdvisory: string;
  classFitAdvisory: string;
  selfStudyAdvisory: string;
  claimedCorrectCount?: number;
  claimedEligibleCourseVersionIds?: string[];
  referencedPaths?: string[];
}

export type AiAdvisoryProviderHook = (
  input: AiAdvisoryCustomProviderInput,
) => Promise<AiAdvisoryRawCandidate> | AiAdvisoryRawCandidate;

export function sanitizeLearnerTextForPrompt(raw: string | null | undefined): {
  sanitized: string;
  hadInjectionPattern: boolean;
} {
  if (!raw) return { sanitized: '', hadInjectionPattern: false };
  const injectionRegex =
    /ignore\s+(all\s+)?previous\s+instructions|system\s*prompt|you\s+are\s+now|<script\b|javascript:|override\s+score|set\s+score\s+to/gi;
  const hadInjectionPattern = injectionRegex.test(raw);
  const sanitized = raw
    .replace(injectionRegex, '[REDACTED_CONTROL_PATTERN]')
    .replace(/[<>]/g, '')
    .slice(0, 600);
  return { sanitized, hadInjectionPattern };
}

export async function generatePlacementAiAdvisory(input: {
  attemptId?: string;
  diagnosis: PlacementStructuredDiagnosis;
  recommendation: PlacementStructuredRecommendation;
  selfStudyGuidance: SelfStudyGuidanceItem[];
  allowlistedPaths: string[];
  learnerTextSamples?: string[];
  providerHook?: AiAdvisoryProviderHook | null;
  timeoutMs?: number;
}): Promise<PlacementAiAdvisoryOutput> {
  const combinedText = (input.learnerTextSamples ?? []).join(' ');
  sanitizeLearnerTextForPrompt(combinedText); // Detection only; never forward student text.
  const allowlistSet = new Set(input.allowlistedPaths);

  const deterministicOutput = buildDeterministicAdvisoryOutput(
    input.diagnosis,
    input.recommendation,
    input.selfStudyGuidance,
  );

  if (!input.providerHook) {
    return {
      ...deterministicOutput,
      providerStatus: 'NOT_CONFIGURED',
      liveVerified: false,
      fallbackUsed: true,
      fallbackReason: 'NO_EXTERNAL_AI_KEY_CONFIGURED',
      modeBadge: 'Hệ thống phân tích / giải thích theo dữ liệu',
      disclosureVi:
        'Nhận xét dưới đây được tổng hợp trực tiếp từ ma trận kết quả làm bài, quy tắc xếp lớp của Học vụ và danh mục học liệu đã kiểm duyệt (chế độ không dùng khóa AI bên ngoài).',
    };
  }

  const timeoutMs = input.timeoutMs ?? 5000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const candidate = await Promise.race<AiAdvisoryRawCandidate>([
      Promise.resolve(
        input.providerHook({
          attemptId: input.attemptId,
          diagnosis: input.diagnosis,
          recommendation: input.recommendation,
          selfStudyGuidance: input.selfStudyGuidance,
          sanitizedLearnerContext: '',
        }),
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('AI_PROVIDER_TIMEOUT')), timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
      }),
    ]);
    if (timer) clearTimeout(timer);

    if (
      !candidate ||
      typeof candidate.diagnosisAdvisory !== 'string' ||
      !candidate.diagnosisAdvisory.trim() ||
      typeof candidate.classFitAdvisory !== 'string' ||
      !candidate.classFitAdvisory.trim() ||
      typeof candidate.selfStudyAdvisory !== 'string' ||
      !candidate.selfStudyAdvisory.trim()
    ) {
      return {
        ...deterministicOutput,
        providerStatus: 'SAFE_FALLBACK',
        liveVerified: false,
        fallbackUsed: true,
        fallbackReason: 'INVALID_AI_OUTPUT_SCHEMA',
        modeBadge: 'Hệ thống phân tích / giải thích theo dữ liệu (Đã chuyển chế độ an toàn)',
      };
    }

    if (
      candidate.claimedCorrectCount !== undefined &&
      candidate.claimedCorrectCount !== input.diagnosis.overallSummary.lrCorrectCount
    ) {
      return {
        ...deterministicOutput,
        providerStatus: 'SAFE_FALLBACK',
        liveVerified: false,
        fallbackUsed: true,
        fallbackReason: 'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
        modeBadge: 'Hệ thống phân tích / giải thích theo dữ liệu (Đã chặn sai lệch điểm số)',
      };
    }

    const deterministicEligibleIds = new Set(
      input.recommendation.courseEvaluations
        .filter((c) =>
          ['RECOMMENDED_PRIORITY', 'ELIGIBLE_ALTERNATIVE', 'ELIGIBLE_NO_OPEN_CLASS'].includes(
            c.status,
          ),
        )
        .map((c) => c.courseVersionId),
    );
    if (
      candidate.claimedEligibleCourseVersionIds &&
      candidate.claimedEligibleCourseVersionIds.some((id) => !deterministicEligibleIds.has(id))
    ) {
      return {
        ...deterministicOutput,
        providerStatus: 'SAFE_FALLBACK',
        liveVerified: false,
        fallbackUsed: true,
        fallbackReason: 'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
        modeBadge:
          'Hệ thống phân tích / giải thích theo dữ liệu (Đã chặn gợi ý khóa học trái quy tắc)',
      };
    }

    const fullText = `${candidate.diagnosisAdvisory} ${candidate.classFitAdvisory} ${candidate.selfStudyAdvisory}`;

    // 1. Forbidden marketing / false guarantees
    const forbiddenPattern =
      /ETS\s+scaled|TOEIC\s+chính\s+thức:\s*\d{3}|chắc\s+chắn\s+đỗ|tuyển\s+thẳng|cam\s+kết\s+đầu\s+ra/i;
    if (forbiddenPattern.test(fullText)) {
      return {
        ...deterministicOutput,
        providerStatus: 'SAFE_FALLBACK',
        liveVerified: false,
        fallbackUsed: true,
        fallbackReason: 'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
        modeBadge:
          'Hệ thống phân tích / giải thích theo dữ liệu (Đã chặn cam kết / điểm số trái quy tắc)',
      };
    }

    // 2. Score mutation detection in free text (even when claimedCorrectCount property is omitted):
    const scoreFractionMatches = fullText.matchAll(/\b(\d{1,3})\s*\/\s*(\d{1,3})\b/g);
    for (const match of scoreFractionMatches) {
      const claimedVal = Number(match[1]);
      const baseVal = Number(match[2]);
      if (baseVal === input.diagnosis.overallSummary.lrTotalItems && baseVal > 0) {
        if (claimedVal !== input.diagnosis.overallSummary.lrCorrectCount) {
          return {
            ...deterministicOutput,
            providerStatus: 'SAFE_FALLBACK',
            liveVerified: false,
            fallbackUsed: true,
            fallbackReason: 'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
            modeBadge:
              'Hệ thống phân tích / giải thích theo dữ liệu (Đã chặn điểm số bịa trong văn bản)',
          };
        }
      }
    }

    // 3. Unauthorized course version ID references in free text:
    const referencedCourseIds = fullText.match(/\bver-[a-zA-Z0-9_-]+\b/g) ?? [];
    for (const refId of referencedCourseIds) {
      if (!deterministicEligibleIds.has(refId)) {
        return {
          ...deterministicOutput,
          providerStatus: 'SAFE_FALLBACK',
          liveVerified: false,
          fallbackUsed: true,
          fallbackReason: 'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
          modeBadge:
            'Hệ thống phân tích / giải thích theo dữ liệu (Đã chặn mã lớp không đủ điều kiện trong văn bản)',
        };
      }
    }

    // 4. Productive skills (Speaking / Writing) fabrication defense:
    const speakingProd = input.diagnosis.productiveSkills.find((p) => p.skill === 'SPEAKING');
    const writingProd = input.diagnosis.productiveSkills.find((p) => p.skill === 'WRITING');
    const speakingPublished = speakingProd && speakingProd.status === 'PUBLISHED';
    const writingPublished = writingProd && writingProd.status === 'PUBLISHED';

    if (!speakingPublished) {
      if (
        /(?:kết quả|điểm|đạt)\s+Speaking\s*[:=]\s*\d/i.test(fullText) ||
        /Speaking\s+đạt\s+\d/i.test(fullText) ||
        /Band\s+\d(?:\.\d)?\s+Speaking/i.test(fullText)
      ) {
        return {
          ...deterministicOutput,
          providerStatus: 'SAFE_FALLBACK',
          liveVerified: false,
          fallbackUsed: true,
          fallbackReason: 'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
          modeBadge: 'Hệ thống phân tích / giải thích theo dữ liệu (Đã chặn bịa kết quả Speaking)',
        };
      }
    }

    if (!writingPublished) {
      if (
        /(?:kết quả|điểm|đạt)\s+Writing\s*[:=]\s*\d/i.test(fullText) ||
        /Writing\s+đạt\s+\d/i.test(fullText) ||
        /Band\s+\d(?:\.\d)?\s+Writing/i.test(fullText)
      ) {
        return {
          ...deterministicOutput,
          providerStatus: 'SAFE_FALLBACK',
          liveVerified: false,
          fallbackUsed: true,
          fallbackReason: 'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED',
          modeBadge: 'Hệ thống phân tích / giải thích theo dữ liệu (Đã chặn bịa kết quả Writing)',
        };
      }
    }

    const urlMatches =
      fullText.match(/https?:\/\/[^\s)>"]+|\/knowledge\/articles\/[a-zA-Z0-9_-]+/g) ?? [];
    const allRefs = [...urlMatches, ...(candidate.referencedPaths ?? [])];
    for (const ref of allRefs) {
      if (!allowlistSet.has(ref)) {
        return {
          ...deterministicOutput,
          providerStatus: 'SAFE_FALLBACK',
          liveVerified: false,
          fallbackUsed: true,
          fallbackReason: 'UNVERIFIED_EXTERNAL_URL_BLOCKED',
          modeBadge:
            'Hệ thống phân tích / giải thích theo dữ liệu (Đã chặn liên kết chưa xác thực)',
        };
      }
    }

    const rendered = renderStructuredAdvice(candidate.fragments, {
      diagnosis: input.diagnosis,
      recommendation: input.recommendation,
      selfStudyGuidance: input.selfStudyGuidance,
      sanitizedLearnerContext: '',
    });
    // Revalidate after await against current server context; custom hooks cannot bypass this boundary.
    return {
      providerStatus: 'CONNECTED_UNVERIFIED',
      liveVerified: false,
      fallbackUsed: false,
      fallbackReason: null,
      modeBadge: 'Gemini AI hỗ trợ giải thích theo kết quả của bạn',
      disclosureVi:
        'Nhận xét do Gemini AI tổng hợp trực tiếp từ số câu đúng/sai từng phần và lịch lớp đang mở.',
      diagnosisAdvisory: rendered.diagnosisAdvisory.trim(),
      classFitAdvisory: rendered.classFitAdvisory.trim(),
      selfStudyAdvisory: rendered.selfStudyAdvisory.trim(),
      safetyChecks: {
        promptInjectionSanitized: true,
        schemaValidated: true,
        scoreImmutabilityVerified: true,
        urlAllowlistVerified: true,
      },
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    const code = err instanceof Error ? err.message : 'AI_PROVIDER_ERROR';
    const fallbackReason =
      code === 'AI_PROVIDER_TIMEOUT' || code === 'PROVIDER_TIMEOUT'
        ? 'AI_PROVIDER_TIMEOUT'
        : code.startsWith('UNVERIFIED_EXTERNAL_URL_BLOCKED')
          ? 'UNVERIFIED_EXTERNAL_URL_BLOCKED'
          : code.startsWith('INVALID_AI_OUTPUT_SCHEMA')
            ? 'INVALID_AI_OUTPUT_SCHEMA'
            : code.startsWith('SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED')
              ? 'SCORE_OR_ELIGIBILITY_MUTATION_BLOCKED'
              : code.startsWith('PROVIDER_RATE_LIMITED_429')
                ? 'PROVIDER_RATE_LIMITED_429'
                : code.startsWith('DAILY_BUDGET_EXCEEDED')
                  ? 'DAILY_BUDGET_EXCEEDED'
                  : 'AI_PROVIDER_ERROR';
    return {
      ...deterministicOutput,
      providerStatus: 'SAFE_FALLBACK',
      liveVerified: false,
      fallbackUsed: true,
      fallbackReason,
      modeBadge: 'Phân tích tự động theo kết quả làm bài',
    };
  }
}

function buildDeterministicAdvisoryOutput(
  diagnosis: PlacementStructuredDiagnosis,
  recommendation: PlacementStructuredRecommendation,
  selfStudy: SelfStudyGuidanceItem[],
): PlacementAiAdvisoryOutput {
  const s = diagnosis.overallSummary;
  const wrongTotal =
    s.lrCorrectCount === null ? 0 : Math.max(0, s.lrAnsweredCount - s.lrCorrectCount);
  const unansweredTotal = Math.max(0, s.lrTotalItems - s.lrAnsweredCount);
  const wrongParts = diagnosis.partBreakdown.filter((p) => p.answered > 0 && p.correct < p.answered);
  const skippedParts = diagnosis.partBreakdown.filter((p) => p.samples > 0 && p.answered === 0);

  const strengthText =
    diagnosis.strengths.length > 0
      ? `Điểm mạnh nổi bật: ${diagnosis.strengths
          .map((x) => `${x.titleVi} (${x.correct}/${x.samples} câu — ${x.accuracyPct}%)`)
          .join('; ')}.`
      : 'Chưa có chủ đề nào nổi bật rõ rệt (đạt từ 65% trở lên).';

  const errorDetailText = wrongParts.length
    ? `Các phần có câu làm sai: ${wrongParts
        .map(
          (p) =>
            `${p.part} (đã làm ${p.answered}/${p.samples} câu: đúng ${p.correct}, sai ${p.answered - p.correct})`,
        )
        .join('; ')}.`
    : 'Chưa ghi nhận câu trả lời sai cụ thể ở các phần đã làm.';

  const skippedText = skippedParts.length
    ? ` Phần chưa trả lời: ${skippedParts.map((p) => `${p.part} (${p.samples} câu)`).join(', ')}.`
    : '';

  const weaknessText =
    diagnosis.improvements.length > 0
      ? `Lỗi sai & trọng tâm cần khắc phục: ${diagnosis.improvements
          .map((x) => `${x.titleVi} (${x.evidenceBadge}) — ${x.pedagogicalSummary}`)
          .join(' ')}.`
      : 'Chưa thấy chủ đề nào bị sai quá nhiều; hãy làm đều các phần để đánh giá chính xác hơn.';

  const productiveText = diagnosis.productiveSkills.length
    ? diagnosis.productiveSkills
        .map((p) =>
          p.status === 'PUBLISHED'
            ? `${p.skill}: ${p.totalScore} điểm rubric nội bộ đã được giảng viên chấm và công bố.`
            : `${p.skill}: ĐANG CHẤM — Chờ giảng viên chấm theo Rubric độc lập.`,
        )
        .join(' ')
    : '';

  const diagnosisAdvisory =
    s.lrCorrectCount !== null
      ? `Tổng kết Nghe – Đọc đạt ${s.lrCorrectCount}/${s.lrTotalItems} câu đúng (${s.lrAccuracyPct}%). Đã làm ${s.lrAnsweredCount}/${s.lrTotalItems} câu (Đúng ${s.lrCorrectCount}, Sai ${wrongTotal}${unansweredTotal > 0 ? `, Bỏ trống ${unansweredTotal}` : ''}). ${errorDetailText}${skippedText} ${s.balanceLabelVi} ${strengthText} ${weaknessText} ${productiveText}`
          .replace(/\s+/g, ' ')
          .trim()
      : `Bài kiểm tra đã ghi nhận ${s.lrAnsweredCount}/${s.lrTotalItems} câu trả lời Nghe – Đọc và đang chờ công bố điểm. ${productiveText}`.trim();

  const topCourse = recommendation.courseEvaluations.find((c) =>
    ['RECOMMENDED_PRIORITY', 'ELIGIBLE_ALTERNATIVE', 'ELIGIBLE_NO_OPEN_CLASS'].includes(c.status),
  );
  const classFitAdvisory = topCourse
    ? `Dựa trên kết quả bài làm thực tế, chương trình phù hợp nhất với bạn là "${topCourse.courseTitle}" (${topCourse.fitSummaryVi}). ${recommendation.overallSummaryVi}`
    : recommendation.overallSummaryVi;

  const selfStudyAdvisory =
    selfStudy.length > 0
      ? `Để cải thiện ngay các chủ điểm ưu tiên, bạn nên ôn tập theo thứ tự: ${selfStudy
          .map(
            (item, idx) =>
              `(${idx + 1}) ${item.topicTitleVi} — từ khóa gợi ý: "${item.searchKeywords[0]}" (${item.resourceStatusLabel})`,
          )
          .join('; ')}.`
      : 'Bạn có thể sử dụng Thư viện Kiến thức Smart English để ôn tập định kỳ theo từng Part TOEIC.';

  return {
    providerStatus: 'NOT_CONFIGURED',
    liveVerified: false,
    fallbackUsed: true,
    fallbackReason: 'NO_EXTERNAL_AI_KEY_CONFIGURED',
    modeBadge: 'Phân tích tự động theo kết quả làm bài',
    disclosureVi:
      'Nhận xét được tổng hợp trực tiếp từ số câu đúng/sai từng phần và lịch lớp đang mở.',
    diagnosisAdvisory,
    classFitAdvisory,
    selfStudyAdvisory,
    safetyChecks: {
      promptInjectionSanitized: true,
      schemaValidated: true,
      scoreImmutabilityVerified: true,
      urlAllowlistVerified: true,
    },
  };
}
