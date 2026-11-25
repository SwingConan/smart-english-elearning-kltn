export interface PlacementPdfPassageMatch {
  instruction: string;
  imageUrls: string[];
}

interface PlacementPdfRule {
  rangePattern: RegExp;
  anchorPattern: RegExp;
  instruction: string;
  files: string[];
}

const TEST_2_PLACEMENT_RULES: PlacementPdfRule[] = [
  {
    rangePattern: /131\s*[-–]\s*134/,
    anchorPattern: /Global Strength Gym/i,
    instruction: 'Questions 131-134 refer to the following advertisement.',
    files: ['p6_q131-134_p5_1.webp'],
  },
  {
    rangePattern: /135\s*[-–]\s*138/,
    anchorPattern: /Hanson-?Roves/i,
    instruction: 'Questions 135-138 refer to the following instructions.',
    files: ['p6_q135-138_p6_1.webp'],
  },
  {
    rangePattern: /139\s*[-–]\s*142/,
    anchorPattern: /fcontini@attmail\.com|btakemoto@arolischems/i,
    instruction: 'Questions 139-142 refer to the following e-mail.',
    files: ['p6_q139-142_p7_1.webp'],
  },
  {
    rangePattern: /143\s*[-–]\s*146/,
    anchorPattern: /MKZ Foods/i,
    instruction: 'Questions 143-146 refer to the following article.',
    files: ['p6_q143-146_p8_1.webp'],
  },
  {
    rangePattern: /147\s*[-–]\s*148/,
    anchorPattern: /Chakia Brown/i,
    instruction: 'Questions 147-148 refer to the following text message.',
    files: ['p7_q147-148_p9_1.webp'],
  },
  {
    rangePattern: /149\s*[-–]\s*150/,
    anchorPattern: /Oak Lane Fashion|Jane Benson/i,
    instruction: 'Questions 149-150 refer to the following e-mail.',
    files: ['p7_q149-150_p10_1.webp'],
  },
  {
    rangePattern: /151\s*[-–]\s*152/,
    anchorPattern: /Carmont Media/i,
    instruction: 'Questions 151-152 refer to the following Web page.',
    files: ['p7_q151-152_p11_1.webp'],
  },
  {
    rangePattern: /153\s*[-–]\s*154/,
    anchorPattern: /Louisa Santos/i,
    instruction: 'Questions 153-154 refer to the following text-message chain.',
    files: ['p7_q153-154_p12_1.webp'],
  },
  {
    rangePattern: /155\s*[-–]\s*157/,
    anchorPattern: /Mark Chandler|Administrative Services Division/i,
    instruction: 'Questions 155-157 refer to the following article from a company newsletter.',
    files: ['p7_q155-157_p13_1.webp'],
  },
  {
    rangePattern: /158\s*[-–]\s*160/,
    anchorPattern: /Megagroome/i,
    instruction: 'Questions 158-160 refer to the following card.',
    files: ['p7_q158-160_p14_1.webp'],
  },
  {
    rangePattern: /161\s*[-–]\s*163/,
    anchorPattern: /DIVERSIFY MUSEUM/i,
    instruction: 'Questions 161-163 refer to the following Web page.',
    files: ['p7_q161-163_p15_1.webp'],
  },
  {
    rangePattern: /164\s*[-–]\s*167/,
    anchorPattern: /Oliver Koh/i,
    instruction: 'Questions 164-167 refer to the following online chat discussion.',
    files: ['p7_q164-167_p16_1.webp'],
  },
  {
    rangePattern: /168\s*[-–]\s*171/,
    anchorPattern: /Won Ho Kim/i,
    instruction: 'Questions 168-171 refer to the following e-mail.',
    files: ['p7_q168-171_p17_1.webp'],
  },
  {
    rangePattern: /172\s*[-–]\s*175/,
    anchorPattern: /Uppsala International Book Fair/i,
    instruction: 'Questions 172-175 refer to the following schedule of events.',
    files: ['p7_q172-175_p18_1.webp'],
  },
  {
    rangePattern: /176\s*[-–]\s*180/,
    anchorPattern: /mountainandforest\.ca/i,
    instruction: 'Questions 176-180 refer to the following Web page and e-mail.',
    files: ['p7_q176-180_p20_1.webp', 'p7_q176-180_p20_2.webp'],
  },
  {
    rangePattern: /181\s*[-–]\s*185/,
    anchorPattern: /Society for Trade and Industry/i,
    instruction: 'Questions 181-185 refer to the following schedule and e-mail.',
    files: ['p7_q181-185_p22_1.webp', 'p7_q181-185_p22_2.webp'],
  },
  {
    rangePattern: /186\s*[-–]\s*190/,
    anchorPattern: /hesidionclinic\.com|nostilde\.com/i,
    instruction: 'Questions 186-190 refer to the following e-mail, list, and article.',
    files: ['p7_q186-190_p24_1.webp', 'p7_q186-190_p24_2.webp', 'p7_q186-190_p25_1.webp'],
  },
  {
    rangePattern: /191\s*[-–]\s*195/,
    anchorPattern: /Singapore Business School/i,
    instruction: 'Questions 191-195 refer to the following brochure, review, and e-mail.',
    files: ['p7_q191-195_p26_1.webp', 'p7_q191-195_p26_2.webp', 'p7_q191-195_p27_1.webp'],
  },
  {
    rangePattern: /196\s*[-–]\s*200/,
    anchorPattern: /Delphine Street/i,
    instruction: 'Questions 196-200 refer to the following advertisement, application, and letter.',
    files: ['p7_q196-200_p28_1.webp', 'p7_q196-200_p29_1.webp'],
  },
];

export function resolvePlacementPdfPassages(group: {
  skill?: string | null;
  taskCode?: string | null;
  title?: string | null;
  stimulusText?: string | null;
  stimuli?: Array<{ type: string; textContent?: string | null }>;
} | null | undefined): PlacementPdfPassageMatch | null {
  if (!group || group.skill !== 'READING') return null;
  if (group.taskCode && !/^(?:LR-)?P[67]$/.test(group.taskCode)) return null;

  const combinedText = [
    group.title ?? '',
    group.stimulusText ?? '',
    ...(group.stimuli ?? []).filter((s) => s.type === 'TEXT').map((s) => s.textContent ?? ''),
  ].join('\n');

  for (const rule of TEST_2_PLACEMENT_RULES) {
    if (rule.rangePattern.test(combinedText) && rule.anchorPattern.test(combinedText)) {
      return {
        instruction: rule.instruction,
        imageUrls: rule.files.map((f) => `/api/v2/practice-tests/media/test-2/images/${f}`),
      };
    }
  }
  return null;
}
