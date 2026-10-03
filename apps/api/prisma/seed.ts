import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AssessmentStage,
  ClassModality,
  ClassOfferingStatus,
  CourseSkillScope,
  CriterionRuleMode,
  EnrollmentStatus,
  EvaluationMetric,
  LessonProgressStatus,
  PrismaClient,
  PricingType,
  QuestionDifficulty,
  QuestionResponseType,
  ResourceType,
  PlacementMode,
  ToeicSkill,
  TestStatus,
  TestAttemptStatus,
  TestPurpose,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { seedM05 } from './m05-seed';
import { seedM06 } from './m06-seed';

const FREE_OFFERING_ID = '10000000-0000-4000-8000-000000000001';
const PAID_OFFERING_ID = '10000000-0000-4000-8000-000000000002';
const DEMO_MODULE_1_ID = '20000000-0000-4000-8000-000000000001';
const DEMO_MODULE_2_ID = '20000000-0000-4000-8000-000000000002';
const DEMO_LESSON_1_ID = '30000000-0000-4000-8000-000000000001';
const DEMO_LESSON_2_ID = '30000000-0000-4000-8000-000000000002';
const DEMO_LESSON_3_ID = '30000000-0000-4000-8000-000000000003';
const DEMO_RESOURCE_VIDEO_ID = '40000000-0000-4000-8000-000000000001';
const DEMO_RESOURCE_DOC_ID = '40000000-0000-4000-8000-000000000002';
const DEMO_RESOURCE_LINK_ID = '40000000-0000-4000-8000-000000000003';
const DEMO_ENROLLMENT_ID = '50000000-0000-4000-8000-000000000001';
const M04_FULL_OFFERING_ENROLLMENT_ID = '50000000-0000-4000-8000-000000000004';
const DEMO_QUESTION_1_ID = '60000000-0000-4000-8000-000000000001';
const DEMO_QUESTION_2_ID = '60000000-0000-4000-8000-000000000002';
const DEMO_QUESTION_3_ID = '60000000-0000-4000-8000-000000000003';
const DEMO_QUESTION_4_ID = '60000000-0000-4000-8000-000000000004';
const DEMO_QUESTION_5_ID = '60000000-0000-4000-8000-000000000005';
const DEMO_PLACEMENT_TEST_ID = '80000000-0000-4000-8000-000000000001';
const M03_PLACEMENT_CORE_TEST_ID = '80000000-0000-4000-8000-000000000011';
const M03_PLACEMENT_ADVANCED_TEST_ID = '80000000-0000-4000-8000-000000000012';
const DEMO_QUIZ_TEST_ID = '80000000-0000-4000-8000-000000000002';
const DEMO_SKILL_GRAMMAR_ID = 'a0000000-0000-4000-8000-000000000001';
const DEMO_SKILL_VOCABULARY_ID = 'a0000000-0000-4000-8000-000000000002';
const DEMO_SKILL_READING_ID = 'a0000000-0000-4000-8000-000000000003';
const DEMO_SKILL_SENTENCE_ID = 'a0000000-0000-4000-8000-000000000004';
const DEMO_ADAPTIVE_POLICY_ID = 'e0000000-0000-4000-8000-000000000001';
const DEMO_EVALUATION_POLICY_ID = 'f0000000-0000-4000-8000-000000000001';
const M04_EVALUATION_POLICY_ID = 'f0000000-0000-4000-8000-000000000004';
const DEMO_RECOMMENDATION_PROFILE_ID = 'f1000000-0000-4000-8000-000000000001';
const DEMO_CLASS_ASSESSMENT_ID = 'f2000000-0000-4000-8000-000000000001';
const DEMO_PRACTICE_TEST_ID = '80000000-0000-4000-8000-000000000003';
const DEMO_PRACTICE_ASSESSMENT_ID = 'f2000000-0000-4000-8000-000000000002';
const DEMO_MIDTERM_TEST_ID = '80000000-0000-4000-8000-000000000004';
const DEMO_FINAL_TEST_ID = '80000000-0000-4000-8000-000000000005';
const DEMO_MIDTERM_ASSESSMENT_ID = 'f2000000-0000-4000-8000-000000000003';
const DEMO_FINAL_ASSESSMENT_ID = 'f2000000-0000-4000-8000-000000000004';
const DEMO_SUBMITTED_ATTEMPT_ID = 'f3000000-0000-4000-8000-000000000001';
const DEMO_MODULE_3_ID = '20000000-0000-4000-8000-000000000003';

const additionalCourseSeeds = [
  {
    id: '01000000-0000-4000-8000-000000000002',
    slug: 'toeic-listening-focus',
    title: 'TOEIC Listening Focus',
    description:
      'Luyện nghe theo bối cảnh hội thoại và thông báo công sở, tập trung nhận diện ý chính và chi tiết.',
    level: 'BASIC',
    skillScope: CourseSkillScope.LISTENING,
  },
  {
    id: '01000000-0000-4000-8000-000000000003',
    slug: 'toeic-reading-strategies',
    title: 'TOEIC Reading Strategies',
    description:
      'Củng cố từ vựng, ngữ pháp và chiến lược đọc nhanh cho văn bản môi trường làm việc.',
    level: 'INTERMEDIATE',
    skillScope: CourseSkillScope.READING,
  },
  {
    id: '01000000-0000-4000-8000-000000000004',
    slug: 'toeic-lr-advancing',
    title: 'TOEIC L&R Advancing',
    description:
      'Chương trình Listening & Reading nâng cao với bài luyện theo thời gian và kỹ thuật kiểm soát tốc độ.',
    level: 'ADVANCING',
    skillScope: CourseSkillScope.LR,
  },
  {
    id: '01000000-0000-4000-8000-000000000005',
    slug: 'workplace-writing-foundations',
    title: 'Workplace Writing Foundations',
    description:
      'Nền tảng viết email và phản hồi ngắn trong môi trường làm việc; chưa bao gồm chấm điểm AI.',
    level: 'FOUNDATION',
    skillScope: CourseSkillScope.WRITING,
  },
] as const;

const additionalOfferingSeeds = [
  [
    '11000000-0000-4000-8000-000000000003',
    0,
    'TOEIC-LIS-01',
    'Listening buổi tối',
    ClassModality.ONLINE,
    PricingType.FREE,
    0,
    24,
  ],
  [
    '11000000-0000-4000-8000-000000000004',
    0,
    'TOEIC-LIS-02',
    'Listening cuối tuần',
    ClassModality.OFFLINE,
    PricingType.PAID,
    1_200_000,
    20,
  ],
  [
    '11000000-0000-4000-8000-000000000005',
    1,
    'TOEIC-REA-01',
    'Reading tăng tốc',
    ClassModality.HYBRID,
    PricingType.PAID,
    1_450_000,
    22,
  ],
  [
    '11000000-0000-4000-8000-000000000006',
    1,
    'TOEIC-REA-02',
    'Reading thực hành',
    ClassModality.ONLINE,
    PricingType.FREE,
    0,
    18,
  ],
  [
    '11000000-0000-4000-8000-000000000007',
    2,
    'TOEIC-LR-ADV-01',
    'L&R nâng cao tối',
    ClassModality.ONLINE,
    PricingType.PAID,
    1_800_000,
    16,
  ],
  [
    '11000000-0000-4000-8000-000000000008',
    2,
    'TOEIC-LR-ADV-02',
    'L&R nâng cao cuối tuần',
    ClassModality.OFFLINE,
    PricingType.PAID,
    1_950_000,
    1,
  ],
  [
    '11000000-0000-4000-8000-000000000009',
    3,
    'WRITING-FDN-01',
    'Writing nền tảng',
    ClassModality.ONLINE,
    PricingType.FREE,
    0,
    25,
  ],
  [
    '11000000-0000-4000-8000-000000000010',
    3,
    'WRITING-FDN-02',
    'Writing thực hành',
    ClassModality.HYBRID,
    PricingType.PAID,
    1_300_000,
    20,
  ],
] as const;

const questionSeeds = [
  {
    id: DEMO_QUESTION_1_ID,
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.EASY,
    content: 'Which greeting is appropriate when meeting someone in the morning?',
    explanation: '“Good morning” is the conventional morning greeting.',
    options: [
      { id: '70000000-0000-4000-8000-000000000001', content: 'Good morning', isCorrect: true },
      { id: '70000000-0000-4000-8000-000000000002', content: 'Good night', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000003', content: 'Goodbye', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000004', content: 'See you later', isCorrect: false },
    ],
  },
  {
    id: DEMO_QUESTION_2_ID,
    type: QuestionResponseType.TRUE_FALSE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.EASY,
    content: '“Hello” can be used as a greeting.',
    explanation: '“Hello” is a common general greeting.',
    options: [
      { id: '70000000-0000-4000-8000-000000000005', content: 'True', isCorrect: true },
      { id: '70000000-0000-4000-8000-000000000006', content: 'False', isCorrect: false },
    ],
  },
  {
    id: DEMO_QUESTION_3_ID,
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'Choose the most polite response to “How are you?”',
    explanation: 'The complete polite response acknowledges the question and returns it.',
    options: [
      {
        id: '70000000-0000-4000-8000-000000000007',
        content: 'I am fine, thank you. And you?',
        isCorrect: true,
      },
      { id: '70000000-0000-4000-8000-000000000008', content: 'Morning', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000009', content: 'Goodbye', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000010', content: 'Please sit', isCorrect: false },
    ],
  },
  {
    id: DEMO_QUESTION_4_ID,
    type: QuestionResponseType.MULTIPLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'Select all phrases that can be used to say goodbye.',
    explanation: 'Both “Goodbye” and “See you later” are leave-taking expressions.',
    options: [
      { id: '70000000-0000-4000-8000-000000000011', content: 'Goodbye', isCorrect: true },
      { id: '70000000-0000-4000-8000-000000000012', content: 'See you later', isCorrect: true },
      { id: '70000000-0000-4000-8000-000000000013', content: 'Good morning', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000014', content: 'How are you?', isCorrect: false },
    ],
  },
  {
    id: DEMO_QUESTION_5_ID,
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.HARD,
    content: 'Which sentence uses the most appropriate formal introduction?',
    explanation: 'The formal construction introduces the speaker clearly and politely.',
    options: [
      {
        id: '70000000-0000-4000-8000-000000000015',
        content: 'Allow me to introduce myself; my name is Linh.',
        isCorrect: true,
      },
      { id: '70000000-0000-4000-8000-000000000016', content: 'Hey, me Linh.', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000017', content: 'Linh here, okay?', isCorrect: false },
      { id: '70000000-0000-4000-8000-000000000018', content: 'You call Linh.', isCorrect: false },
    ],
  },
] as const;

const m03PlacementFoundationQuestionSeeds = [
  {
    id: '62000000-0000-4000-8000-000000000001',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.EASY,
    content: 'Where should new employees enter the building?',
    explanation: 'The announcement asks new employees to use the lobby entrance.',
    options: [
      { id: '72000000-0000-4000-8000-000000000001', content: 'The lobby entrance', isCorrect: true },
      { id: '72000000-0000-4000-8000-000000000002', content: 'The loading area', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000003', content: 'The staff cafeteria', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000004', content: 'The parking garage', isCorrect: false },
    ],
  },
  {
    id: '62000000-0000-4000-8000-000000000002',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.EASY,
    content: 'When will the welcome desk open?',
    explanation: 'The welcome desk opens at eight forty-five.',
    options: [
      { id: '72000000-0000-4000-8000-000000000005', content: '8:15', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000006', content: '8:30', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000007', content: '8:45', isCorrect: true },
      { id: '72000000-0000-4000-8000-000000000008', content: '9:15', isCorrect: false },
    ],
  },
  {
    id: '62000000-0000-4000-8000-000000000003',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.EASY,
    content: 'Why is the caller leaving a message?',
    explanation: 'The caller says that the appointment time has changed.',
    options: [
      { id: '72000000-0000-4000-8000-000000000009', content: 'To change an appointment', isCorrect: true },
      { id: '72000000-0000-4000-8000-000000000010', content: 'To order office supplies', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000011', content: 'To request a refund', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000012', content: 'To invite a new customer', isCorrect: false },
    ],
  },
  {
    id: '62000000-0000-4000-8000-000000000004',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'What should the listener do next?',
    explanation: 'The caller asks the listener to call back and confirm the new time.',
    options: [
      { id: '72000000-0000-4000-8000-000000000013', content: 'Call back to confirm', isCorrect: true },
      { id: '72000000-0000-4000-8000-000000000014', content: 'Visit the office today', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000015', content: 'Send a payment receipt', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000016', content: 'Book a meeting room', isCorrect: false },
    ],
  },
  {
    id: '62000000-0000-4000-8000-000000000005',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.EASY,
    content: 'What will arrive on Wednesday?',
    explanation: 'The email says that printer paper will arrive on Wednesday morning.',
    options: [
      { id: '72000000-0000-4000-8000-000000000017', content: 'Printer paper', isCorrect: true },
      { id: '72000000-0000-4000-8000-000000000018', content: 'New computers', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000019', content: 'Office chairs', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000020', content: 'Staff uniforms', isCorrect: false },
    ],
  },
  {
    id: '62000000-0000-4000-8000-000000000006',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.EASY,
    content: 'Where should the supplies be stored?',
    explanation: 'The message asks staff to place the supplies in the cabinet beside the printer.',
    options: [
      { id: '72000000-0000-4000-8000-000000000021', content: 'In the cabinet beside the printer', isCorrect: true },
      { id: '72000000-0000-4000-8000-000000000022', content: 'At the reception desk', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000023', content: 'In the meeting room', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000024', content: 'Near the main entrance', isCorrect: false },
    ],
  },
  {
    id: '62000000-0000-4000-8000-000000000007',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.EASY,
    content: 'Why will the cafeteria be closed?',
    explanation: 'The notice says that the cafeteria will close for cleaning.',
    options: [
      { id: '72000000-0000-4000-8000-000000000025', content: 'For cleaning', isCorrect: true },
      { id: '72000000-0000-4000-8000-000000000026', content: 'For a staff meeting', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000027', content: 'For new equipment', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000028', content: 'For a private event', isCorrect: false },
    ],
  },
  {
    id: '62000000-0000-4000-8000-000000000008',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'What alternative does the notice suggest?',
    explanation: 'Employees can use the vending machines on the first floor.',
    options: [
      { id: '72000000-0000-4000-8000-000000000029', content: 'Use the first-floor vending machines', isCorrect: true },
      { id: '72000000-0000-4000-8000-000000000030', content: 'Bring food to reception', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000031', content: 'Order from the finance office', isCorrect: false },
      { id: '72000000-0000-4000-8000-000000000032', content: 'Visit the training center', isCorrect: false },
    ],
  },
] as const;

const m03PlacementCoreQuestionSeeds = [
  {
    id: '61000000-0000-4000-8000-000000000001',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.EASY,
    content: 'Where should visitors collect their name badges?',
    explanation: 'The announcement directs visitors to collect badges at reception.',
    options: [
      { id: '71000000-0000-4000-8000-000000000001', content: 'At reception', isCorrect: true },
      { id: '71000000-0000-4000-8000-000000000002', content: 'In the cafeteria', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000003', content: 'Beside the elevator', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000004', content: 'Inside the meeting room', isCorrect: false },
    ],
  },
  {
    id: '61000000-0000-4000-8000-000000000002',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.EASY,
    content: 'What time will the orientation begin?',
    explanation: 'The announcement states that orientation begins at nine thirty.',
    options: [
      { id: '71000000-0000-4000-8000-000000000005', content: '8:30', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000006', content: '9:00', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000007', content: '9:30', isCorrect: true },
      { id: '71000000-0000-4000-8000-000000000008', content: '10:00', isCorrect: false },
    ],
  },
  {
    id: '61000000-0000-4000-8000-000000000003',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'Why is the delivery delayed?',
    explanation: 'The caller explains that severe weather delayed the delivery truck.',
    options: [
      { id: '71000000-0000-4000-8000-000000000009', content: 'The address was incorrect', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000010', content: 'The weather affected transport', isCorrect: true },
      { id: '71000000-0000-4000-8000-000000000011', content: 'The warehouse was closed', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000012', content: 'The order was cancelled', isCorrect: false },
    ],
  },
  {
    id: '61000000-0000-4000-8000-000000000004',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'What does the caller offer to do?',
    explanation: 'The caller offers to email an updated delivery schedule.',
    options: [
      { id: '71000000-0000-4000-8000-000000000013', content: 'Refund the order', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000014', content: 'Send an updated schedule', isCorrect: true },
      { id: '71000000-0000-4000-8000-000000000015', content: 'Change the delivery address', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000016', content: 'Call the warehouse manager', isCorrect: false },
    ],
  },
  {
    id: '61000000-0000-4000-8000-000000000005',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.EASY,
    content: 'What is the purpose of the email?',
    explanation: 'The email confirms the room and time for a scheduled meeting.',
    options: [
      { id: '71000000-0000-4000-8000-000000000017', content: 'To confirm meeting details', isCorrect: true },
      { id: '71000000-0000-4000-8000-000000000018', content: 'To request annual leave', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000019', content: 'To advertise a conference', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000020', content: 'To cancel a reservation', isCorrect: false },
    ],
  },
  {
    id: '61000000-0000-4000-8000-000000000006',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.EASY,
    content: 'Where will the meeting take place?',
    explanation: 'The email names Conference Room B as the meeting location.',
    options: [
      { id: '71000000-0000-4000-8000-000000000021', content: 'Conference Room A', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000022', content: 'Conference Room B', isCorrect: true },
      { id: '71000000-0000-4000-8000-000000000023', content: 'The training center', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000024', content: 'The main lobby', isCorrect: false },
    ],
  },
  {
    id: '61000000-0000-4000-8000-000000000007',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'What must employees do before Friday?',
    explanation: 'The notice asks employees to update their emergency contact information.',
    options: [
      { id: '71000000-0000-4000-8000-000000000025', content: 'Submit a travel request', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000026', content: 'Update emergency contact details', isCorrect: true },
      { id: '71000000-0000-4000-8000-000000000027', content: 'Complete a safety course', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000028', content: 'Return office equipment', isCorrect: false },
    ],
  },
  {
    id: '61000000-0000-4000-8000-000000000008',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'Who should employees contact if they need help?',
    explanation: 'The final sentence directs questions to the Human Resources desk.',
    options: [
      { id: '71000000-0000-4000-8000-000000000029', content: 'The finance team', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000030', content: 'The building manager', isCorrect: false },
      { id: '71000000-0000-4000-8000-000000000031', content: 'The Human Resources desk', isCorrect: true },
      { id: '71000000-0000-4000-8000-000000000032', content: 'The security office', isCorrect: false },
    ],
  },
] as const;

const m03PlacementAdvancedQuestionSeeds = [
  {
    id: '63000000-0000-4000-8000-000000000001',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'What caused the supplier to revise its quotation?',
    explanation: 'The supplier revised the quotation after transportation costs increased.',
    options: [
      { id: '73000000-0000-4000-8000-000000000001', content: 'Higher transportation costs', isCorrect: true },
      { id: '73000000-0000-4000-8000-000000000002', content: 'A change in product design', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000003', content: 'A smaller order quantity', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000004', content: 'New payment regulations', isCorrect: false },
    ],
  },
  {
    id: '63000000-0000-4000-8000-000000000002',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.HARD,
    content: 'What is the manager most likely trying to determine?',
    explanation: 'Comparing purchase price and three-year maintenance reveals the best long-term value.',
    options: [
      { id: '73000000-0000-4000-8000-000000000005', content: 'Which offer provides better long-term value', isCorrect: true },
      { id: '73000000-0000-4000-8000-000000000006', content: 'Which employee placed the first order', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000007', content: 'Whether the office needs more storage', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000008', content: 'When the current contract was signed', isCorrect: false },
    ],
  },
  {
    id: '63000000-0000-4000-8000-000000000003',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'What should employees do before Friday evening?',
    explanation: 'Employees are told to download any cloud files needed during maintenance.',
    options: [
      { id: '73000000-0000-4000-8000-000000000009', content: 'Download files needed for weekend work', isCorrect: true },
      { id: '73000000-0000-4000-8000-000000000010', content: 'Replace their office computers', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000011', content: 'Submit a travel expense form', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000012', content: 'Change their account password', isCorrect: false },
    ],
  },
  {
    id: '63000000-0000-4000-8000-000000000004',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.LISTENING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'Why might an employee contact the help desk on Monday?',
    explanation: 'The announcement says to contact the help desk if access does not return after restarting.',
    options: [
      { id: '73000000-0000-4000-8000-000000000013', content: 'Cloud access is still unavailable after a restart', isCorrect: true },
      { id: '73000000-0000-4000-8000-000000000014', content: 'A meeting room is double-booked', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000015', content: 'A printed report is missing', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000016', content: 'The cafeteria opens late', isCorrect: false },
    ],
  },
  {
    id: '63000000-0000-4000-8000-000000000005',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'What is the purpose of the proposed pilot?',
    explanation: 'The pilot will test whether staggered hours improve coverage without reducing collaboration.',
    options: [
      { id: '73000000-0000-4000-8000-000000000017', content: 'To evaluate a staggered-hours arrangement', isCorrect: true },
      { id: '73000000-0000-4000-8000-000000000018', content: 'To reduce the number of project teams', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000019', content: 'To select a new office location', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000020', content: 'To replace the attendance system', isCorrect: false },
    ],
  },
  {
    id: '63000000-0000-4000-8000-000000000006',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.HARD,
    content: 'What concern does the email imply the pilot must address?',
    explanation: 'The email emphasizes maintaining client coverage and collaboration while allowing flexible hours.',
    options: [
      { id: '73000000-0000-4000-8000-000000000021', content: 'Service and teamwork must remain reliable', isCorrect: true },
      { id: '73000000-0000-4000-8000-000000000022', content: 'Employees may need larger desks', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000023', content: 'The company lacks training rooms', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000024', content: 'Managers cannot access payroll records', isCorrect: false },
    ],
  },
  {
    id: '63000000-0000-4000-8000-000000000007',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'When are two competitive quotations normally required?',
    explanation: 'The policy requires two quotations for purchases above the stated threshold.',
    options: [
      { id: '73000000-0000-4000-8000-000000000025', content: 'When a purchase exceeds the stated threshold', isCorrect: true },
      { id: '73000000-0000-4000-8000-000000000026', content: 'When an invoice arrives early', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000027', content: 'When supplies are delivered locally', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000028', content: 'When a department hires new staff', isCorrect: false },
    ],
  },
  {
    id: '63000000-0000-4000-8000-000000000008',
    type: QuestionResponseType.SINGLE_CHOICE,
    toeicSkill: ToeicSkill.READING,
    difficulty: QuestionDifficulty.MEDIUM,
    content: 'What must accompany a request to renew an existing service?',
    explanation: 'A renewal request must explain why changing providers would disrupt operations.',
    options: [
      { id: '73000000-0000-4000-8000-000000000029', content: 'A written operational justification', isCorrect: true },
      { id: '73000000-0000-4000-8000-000000000030', content: 'A copy of every previous invoice', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000031', content: 'A new employee schedule', isCorrect: false },
      { id: '73000000-0000-4000-8000-000000000032', content: 'A customer satisfaction survey', isCorrect: false },
    ],
  },
] as const;

const m03PlacementForms = [
  {
    id: DEMO_PLACEMENT_TEST_ID,
    title: 'Kiểm tra đầu vào L&R — Nền tảng',
    description: 'Bài đánh giá nội bộ Listening và Reading dành cho người mới bắt đầu.',
    duration: 20,
    questionIds: [
      '90000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000002',
      '90000000-0000-4000-8000-000000000003',
      '90000000-0000-4000-8000-000000000004',
      '90000000-0000-4000-8000-000000000005',
      '9c000000-0000-4000-8000-000000000006',
      '9c000000-0000-4000-8000-000000000007',
      '9c000000-0000-4000-8000-000000000008',
    ],
    groupPrefix: '81000000-0000-4000-8000-00000000000',
  },
  {
    id: M03_PLACEMENT_CORE_TEST_ID,
    title: 'Kiểm tra đầu vào L&R — Cốt lõi',
    description: 'Bài đánh giá nội bộ Listening và Reading ở mức cơ bản đến trung bình.',
    duration: 25,
    questionIds: [
      '9a000000-0000-4000-8000-000000000001',
      '9a000000-0000-4000-8000-000000000002',
      '9a000000-0000-4000-8000-000000000003',
      '9a000000-0000-4000-8000-000000000004',
      '9a000000-0000-4000-8000-000000000005',
      '9a000000-0000-4000-8000-000000000006',
      '9a000000-0000-4000-8000-000000000007',
      '9a000000-0000-4000-8000-000000000008',
    ],
    groupPrefix: '82000000-0000-4000-8000-00000000000',
  },
  {
    id: M03_PLACEMENT_ADVANCED_TEST_ID,
    title: 'Kiểm tra đầu vào L&R — Nâng cao',
    description: 'Bài đánh giá nội bộ Listening và Reading cho người học đã có nền tảng tốt.',
    duration: 30,
    questionIds: [
      '9b000000-0000-4000-8000-000000000001',
      '9b000000-0000-4000-8000-000000000002',
      '9b000000-0000-4000-8000-000000000003',
      '9b000000-0000-4000-8000-000000000004',
      '9b000000-0000-4000-8000-000000000005',
      '9b000000-0000-4000-8000-000000000006',
      '9b000000-0000-4000-8000-000000000007',
      '9b000000-0000-4000-8000-000000000008',
    ],
    groupPrefix: '83000000-0000-4000-8000-00000000000',
  },
] as const;

const m03PlacementCoreGroupContent = [
  {
    skill: ToeicSkill.LISTENING,
    title: 'Thông báo tại văn phòng',
    instructions: 'Nghe thông báo và trả lời câu 1–2.',
    stimulusText:
      'Welcome to Northstar Consulting. Please collect your name badge at reception. The orientation begins at nine thirty in Conference Room A.',
    audioUrl:
      'tts:Welcome to Northstar Consulting. Please collect your name badge at reception. The orientation begins at nine thirty in Conference Room A.',
  },
  {
    skill: ToeicSkill.LISTENING,
    title: 'Tin nhắn giao hàng',
    instructions: 'Nghe tin nhắn và trả lời câu 3–4.',
    stimulusText:
      'This is Maya from City Delivery. Severe weather has delayed your order until Thursday afternoon. I will email you an updated schedule today.',
    audioUrl:
      'tts:This is Maya from City Delivery. Severe weather has delayed your order until Thursday afternoon. I will email you an updated schedule today.',
  },
  {
    skill: ToeicSkill.READING,
    title: 'Email xác nhận cuộc họp',
    instructions: 'Đọc email và trả lời câu 5–6.',
    stimulusText:
      'Subject: Project meeting confirmation\nHello team, our project meeting is confirmed for Tuesday at 2:00 p.m. in Conference Room B. Please bring the revised timeline.\nRegards, Elena',
    audioUrl: null,
  },
  {
    skill: ToeicSkill.READING,
    title: 'Thông báo nhân sự',
    instructions: 'Đọc thông báo và trả lời câu 7–8.',
    stimulusText:
      'All employees must update their emergency contact information in the staff portal before Friday. If you need assistance, contact the Human Resources desk on the second floor.',
    audioUrl: null,
  },
] as const;

const m03PlacementFoundationGroupContent = [
  {
    skill: ToeicSkill.LISTENING,
    title: 'Hướng dẫn ngày đầu làm việc',
    instructions: 'Nghe thông báo ngắn và trả lời câu 1–2.',
    stimulusText:
      'Good morning, new employees. Please enter through the lobby entrance. The welcome desk opens at eight forty-five beside reception.',
    audioUrl:
      'tts:Good morning, new employees. Please enter through the lobby entrance. The welcome desk opens at eight forty-five beside reception.',
  },
  {
    skill: ToeicSkill.LISTENING,
    title: 'Tin nhắn đổi lịch hẹn',
    instructions: 'Nghe tin nhắn và trả lời câu 3–4.',
    stimulusText:
      'Hello, this is Anna from Green Dental Clinic. Your Tuesday appointment has moved to two p.m. Please call us back to confirm the new time.',
    audioUrl:
      'tts:Hello, this is Anna from Green Dental Clinic. Your Tuesday appointment has moved to two p.m. Please call us back to confirm the new time.',
  },
  {
    skill: ToeicSkill.READING,
    title: 'Email giao văn phòng phẩm',
    instructions: 'Đọc email ngắn và trả lời câu 5–6.',
    stimulusText:
      'Subject: Paper delivery\nThe printer paper will arrive on Wednesday morning. Please put the boxes in the cabinet beside the printer.\nThank you, Minh',
    audioUrl: null,
  },
  {
    skill: ToeicSkill.READING,
    title: 'Thông báo đóng cửa căn-tin',
    instructions: 'Đọc thông báo và trả lời câu 7–8.',
    stimulusText:
      'The staff cafeteria will be closed this Friday for cleaning. Drinks and snacks are available from the vending machines on the first floor.',
    audioUrl: null,
  },
] as const;

const m03PlacementAdvancedGroupContent = [
  {
    skill: ToeicSkill.LISTENING,
    title: 'Trao đổi về báo giá nhà cung cấp',
    instructions: 'Nghe cập nhật dự án và trả lời câu 1–2.',
    stimulusText:
      'The supplier revised its quotation after transportation costs increased. Before we respond, compare both proposals, including their three-year maintenance plans, and send me your recommendation by Friday.',
    audioUrl:
      'tts:The supplier revised its quotation after transportation costs increased. Before we respond, compare both proposals, including their three-year maintenance plans, and send me your recommendation by Friday.',
  },
  {
    skill: ToeicSkill.LISTENING,
    title: 'Thông báo bảo trì hệ thống',
    instructions: 'Nghe thông báo kỹ thuật và trả lời câu 3–4.',
    stimulusText:
      'Cloud services will be unavailable from Friday at seven p.m. until Sunday afternoon. Download files needed for weekend work in advance. On Monday, restart your computer before contacting the help desk if access has not returned.',
    audioUrl:
      'tts:Cloud services will be unavailable from Friday at seven p.m. until Sunday afternoon. Download files needed for weekend work in advance. On Monday, restart your computer before contacting the help desk if access has not returned.',
  },
  {
    skill: ToeicSkill.READING,
    title: 'Đề xuất giờ làm việc linh hoạt',
    instructions: 'Đọc đề xuất và trả lời câu 5–6.',
    stimulusText:
      'Subject: Staggered-hours pilot\nBeginning next month, two project teams will test staggered starting times for six weeks. The pilot is intended to extend client coverage while preserving daily collaboration. Managers should nominate participants whose responsibilities can be handed over clearly between shifts and report any service delays during the trial.',
    audioUrl: null,
  },
  {
    skill: ToeicSkill.READING,
    title: 'Quy định lựa chọn nhà cung cấp',
    instructions: 'Đọc quy định và trả lời câu 7–8.',
    stimulusText:
      'Purchases above 80 million VND normally require quotations from at least two qualified suppliers. A department requesting renewal with an existing service provider may seek an exception, but it must attach a written explanation of how changing providers would disrupt current operations. Procurement approval is still required before any commitment is made.',
    audioUrl: null,
  },
] as const;

type M03PlacementQuestionSeed =
  | (typeof m03PlacementFoundationQuestionSeeds)[number]
  | (typeof m03PlacementCoreQuestionSeeds)[number]
  | (typeof m03PlacementAdvancedQuestionSeeds)[number];
type M03PlacementGroupSeed =
  | (typeof m03PlacementFoundationGroupContent)[number]
  | (typeof m03PlacementCoreGroupContent)[number]
  | (typeof m03PlacementAdvancedGroupContent)[number];

const m03PlacementContentByFormId = new Map<
  string,
  { questions: readonly M03PlacementQuestionSeed[]; groups: readonly M03PlacementGroupSeed[] }
>([
  [
    DEMO_PLACEMENT_TEST_ID,
    {
      questions: m03PlacementFoundationQuestionSeeds,
      groups: m03PlacementFoundationGroupContent,
    },
  ],
  [
    M03_PLACEMENT_CORE_TEST_ID,
    { questions: m03PlacementCoreQuestionSeeds, groups: m03PlacementCoreGroupContent },
  ],
  [
    M03_PLACEMENT_ADVANCED_TEST_ID,
    { questions: m03PlacementAdvancedQuestionSeeds, groups: m03PlacementAdvancedGroupContent },
  ],
]);

const quizQuestionSeeds = [
  { id: '90000000-0000-4000-8000-000000000006', questionId: DEMO_QUESTION_1_ID, points: 1 },
  { id: '90000000-0000-4000-8000-000000000007', questionId: DEMO_QUESTION_2_ID, points: 1 },
  { id: '90000000-0000-4000-8000-000000000008', questionId: DEMO_QUESTION_4_ID, points: 2 },
] as const;

const skillSeeds = [
  {
    id: DEMO_SKILL_GRAMMAR_ID,
    code: 'GRAMMAR_BASIC',
    name: 'Basic Grammar',
    description: 'Foundational grammar patterns for introductory English communication.',
    pInit: 0.5,
  },
  {
    id: DEMO_SKILL_VOCABULARY_ID,
    code: 'VOCAB_FOUNDATION',
    name: 'Vocabulary Foundation',
    description: 'Core vocabulary used in greetings and everyday exchanges.',
    pInit: 0.5,
  },
  {
    id: DEMO_SKILL_READING_ID,
    code: 'READING_COMPREHENSION',
    name: 'Reading Comprehension',
    description: 'Understanding meaning in short introductory English texts.',
    pInit: 0.3,
  },
  {
    id: DEMO_SKILL_SENTENCE_ID,
    code: 'SENTENCE_CONSTRUCTION',
    name: 'Sentence Construction',
    description: 'Building complete and appropriate English sentences.',
    pInit: 0.3,
  },
] as const;

const prerequisiteSeeds = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    skillId: DEMO_SKILL_SENTENCE_ID,
    prerequisiteSkillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    skillId: DEMO_SKILL_READING_ID,
    prerequisiteSkillId: DEMO_SKILL_VOCABULARY_ID,
  },
] as const;

const questionSkillSeeds = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    questionId: DEMO_QUESTION_1_ID,
    skillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    questionId: DEMO_QUESTION_1_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    questionId: DEMO_QUESTION_2_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000004',
    questionId: DEMO_QUESTION_3_ID,
    skillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000005',
    questionId: DEMO_QUESTION_3_ID,
    skillId: DEMO_SKILL_SENTENCE_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000006',
    questionId: DEMO_QUESTION_4_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000007',
    questionId: DEMO_QUESTION_5_ID,
    skillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000008',
    questionId: DEMO_QUESTION_5_ID,
    skillId: DEMO_SKILL_SENTENCE_ID,
  },
] as const;

const lessonSkillSeeds = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    lessonId: DEMO_LESSON_1_ID,
    skillId: DEMO_SKILL_GRAMMAR_ID,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    lessonId: DEMO_LESSON_1_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    lessonId: DEMO_LESSON_2_ID,
    skillId: DEMO_SKILL_VOCABULARY_ID,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000004',
    lessonId: DEMO_LESSON_2_ID,
    skillId: DEMO_SKILL_SENTENCE_ID,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000005',
    lessonId: DEMO_LESSON_3_ID,
    skillId: DEMO_SKILL_READING_ID,
  },
] as const;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.SEED_DEFAULT_PASSWORD;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed is disabled in production.');
  }
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run the development seed.');
  }
  if (!password || password.length < 8 || password.length > 128) {
    throw new Error('SEED_DEFAULT_PASSWORD must be configured with 8 to 128 characters.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    // Development-only hygiene: remove known catalog fixtures left by interrupted E2E runs.
    // The match is intentionally narrow and never targets arbitrary course data.
    const leakedFixtureCourses = await prisma.course.findMany({
      where: {
        OR: [
          { title: { startsWith: 'VS01 ' }, description: 'Phase 3 E2E course' },
          {
            title: { startsWith: 'Concurrent Course ' },
            description: 'Concurrent slug verification',
          },
        ],
      },
      select: { id: true },
    });
    const leakedCourseIds = leakedFixtureCourses.map(({ id }) => id);
    if (leakedCourseIds.length) {
      await prisma.enrollment.deleteMany({
        where: { classOffering: { courseId: { in: leakedCourseIds } } },
      });
      await prisma.classScheduleSlot.deleteMany({
        where: { classOffering: { courseId: { in: leakedCourseIds } } },
      });
      await prisma.classOffering.deleteMany({ where: { courseId: { in: leakedCourseIds } } });
      await prisma.course.deleteMany({ where: { id: { in: leakedCourseIds } } });
    }
    await prisma.user.deleteMany({
      where: {
        email: { startsWith: 'vs01-' },
        fullName: { startsWith: 'VS01 ' },
      },
    });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const users = await Promise.all(
      [
        {
          email: 'admin.demo@smart-elearning.local',
          fullName: 'Quản trị viên học vụ',
          role: UserRole.ADMIN_COORDINATOR,
        },
        {
          email: 'instructor.demo@smart-elearning.local',
          fullName: 'Trần Thu Hà',
          role: UserRole.INSTRUCTOR,
        },
        {
          email: 'student.demo@smart-elearning.local',
          fullName: 'Nguyễn Minh Anh',
          role: UserRole.STUDENT,
        },
      ].map((user) =>
        prisma.user.upsert({
          where: { email: user.email },
          update: {
            fullName: user.fullName,
            role: user.role,
            status: UserStatus.ACTIVE,
            passwordHash,
          },
          create: {
            ...user,
            status: UserStatus.ACTIVE,
            passwordHash,
          },
        }),
      ),
    );

    const admin = users.find((user) => user.role === UserRole.ADMIN_COORDINATOR);
    const instructor = users.find((user) => user.role === UserRole.INSTRUCTOR);
    if (!admin || !instructor) {
      throw new Error('Development seed could not prepare demo users.');
    }

    const course = await prisma.course.upsert({
      where: { slug: 'demo-english-foundations' },
      update: {
        title: 'TOEIC Workplace Foundations',
        description:
          'Xây dựng nền tảng Listening và Reading qua các tình huống giao tiếp nơi làm việc.',
        level: 'FOUNDATION',
        skillScope: CourseSkillScope.LR,
        isPublished: true,
        createdById: admin.id,
      },
      create: {
        title: 'TOEIC Workplace Foundations',
        slug: 'demo-english-foundations',
        description:
          'Xây dựng nền tảng Listening và Reading qua các tình huống giao tiếp nơi làm việc.',
        level: 'FOUNDATION',
        skillScope: CourseSkillScope.LR,
        isPublished: true,
        createdById: admin.id,
      },
    });

    await seedM05(prisma, course.id);

    const additionalCourses = [];
    for (const seed of additionalCourseSeeds) {
      additionalCourses.push(
        await prisma.course.upsert({
          where: { slug: seed.slug },
          update: {
            title: seed.title,
            description: seed.description,
            level: seed.level,
            skillScope: seed.skillScope,
            isPublished: true,
            createdById: admin.id,
          },
          create: {
            id: seed.id,
            slug: seed.slug,
            title: seed.title,
            description: seed.description,
            level: seed.level,
            skillScope: seed.skillScope,
            isPublished: true,
            createdById: admin.id,
          },
        }),
      );
    }

    await prisma.courseAdaptivePolicy.upsert({
      where: { courseId: course.id },
      update: {
        remedialThreshold: 0.4,
        progressionThreshold: 0.8,
      },
      create: {
        id: DEMO_ADAPTIVE_POLICY_ID,
        courseId: course.id,
        remedialThreshold: 0.4,
        progressionThreshold: 0.8,
      },
    });

    const legacyEvaluationPolicy = await prisma.evaluationPolicy.upsert({
      where: { code: 'DEMO_PLACEMENT_LR_V1' },
      update: {
        name: 'Demo internal L&R placement policy',
        placementMode: PlacementMode.LR,
        ruleConfig: { version: 1, basis: 'internal-demo', officialToeicEquivalence: false },
        isActive: false,
      },
      create: {
        id: DEMO_EVALUATION_POLICY_ID,
        code: 'DEMO_PLACEMENT_LR_V1',
        name: 'Demo internal L&R placement policy',
        placementMode: PlacementMode.LR,
        ruleConfig: { version: 1, basis: 'internal-demo', officialToeicEquivalence: false },
        isActive: false,
      },
    });

    const evaluationBands = [
      {
        id: 'f0100000-0000-4000-8000-000000000001',
        code: 'FOUNDATION',
        label: 'Foundation',
        minValue: 10,
        maxValue: 450,
        orderIndex: 0,
      },
      {
        id: 'f0100000-0000-4000-8000-000000000002',
        code: 'DEVELOPING',
        label: 'Developing',
        minValue: 455,
        maxValue: 700,
        orderIndex: 1,
      },
      {
        id: 'f0100000-0000-4000-8000-000000000003',
        code: 'ADVANCING',
        label: 'Advancing',
        minValue: 705,
        maxValue: 990,
        orderIndex: 2,
      },
    ] as const;
    for (const band of evaluationBands) {
      await prisma.evaluationBand.upsert({
        where: { id: band.id },
        update: {
          ...band,
          policyId: legacyEvaluationPolicy.id,
          metric: EvaluationMetric.LR_TOTAL,
          skill: null,
        },
        create: {
          ...band,
          policyId: legacyEvaluationPolicy.id,
          metric: EvaluationMetric.LR_TOTAL,
          skill: null,
        },
      });
    }

    await prisma.evaluationPolicy.updateMany({
      where: {
        placementMode: PlacementMode.LR,
        code: { not: 'M04_PLACEMENT_LR_NORMALIZED_V1' },
      },
      data: { isActive: false },
    });
    const m04EvaluationPolicy = await prisma.evaluationPolicy.upsert({
      where: { code: 'M04_PLACEMENT_LR_NORMALIZED_V1' },
      update: {
        name: 'Đánh giá nội bộ Placement L&R theo tỷ lệ đúng',
        placementMode: PlacementMode.LR,
        ruleConfig: {
          version: 1,
          basis: 'internal-normalized',
          officialToeicEquivalence: false,
          intervalConvention: 'MIN_INCLUSIVE_MAX_EXCLUSIVE_TERMINAL_INCLUSIVE',
        },
        isActive: true,
      },
      create: {
        id: M04_EVALUATION_POLICY_ID,
        code: 'M04_PLACEMENT_LR_NORMALIZED_V1',
        name: 'Đánh giá nội bộ Placement L&R theo tỷ lệ đúng',
        placementMode: PlacementMode.LR,
        ruleConfig: {
          version: 1,
          basis: 'internal-normalized',
          officialToeicEquivalence: false,
          intervalConvention: 'MIN_INCLUSIVE_MAX_EXCLUSIVE_TERMINAL_INCLUSIVE',
        },
        isActive: true,
      },
    });
    const m04Bands = [
      { id: 'f0400000-0000-4000-8000-000000000001', code: 'FOUNDATION', label: 'Nền tảng', minValue: 0, maxValue: 45, orderIndex: 0 },
      { id: 'f0400000-0000-4000-8000-000000000002', code: 'DEVELOPING', label: 'Đang phát triển', minValue: 45, maxValue: 70, orderIndex: 1 },
      { id: 'f0400000-0000-4000-8000-000000000003', code: 'ADVANCING', label: 'Nâng cao', minValue: 70, maxValue: 100, orderIndex: 2 },
    ] as const;
    for (const band of m04Bands) {
      await prisma.evaluationBand.upsert({
        where: { id: band.id },
        update: {
          ...band,
          policyId: m04EvaluationPolicy.id,
          metric: EvaluationMetric.LR_NORMALIZED,
          skill: null,
        },
        create: {
          ...band,
          policyId: m04EvaluationPolicy.id,
          metric: EvaluationMetric.LR_NORMALIZED,
          skill: null,
        },
      });
    }

    const recommendationProfile = await prisma.courseRecommendationProfile.upsert({
      where: { courseId: course.id },
      update: { ruleMode: CriterionRuleMode.ALL, priority: 100, isActive: true },
      create: {
        id: DEMO_RECOMMENDATION_PROFILE_ID,
        courseId: course.id,
        ruleMode: CriterionRuleMode.ALL,
        priority: 100,
        isActive: true,
      },
    });
    for (const [index, skill] of [ToeicSkill.LISTENING, ToeicSkill.READING].entries()) {
      await prisma.courseSkillCriterion.upsert({
        where: { profileId_skill: { profileId: recommendationProfile.id, skill } },
        update: {
          minNormalizedScore: 0,
          maxNormalizedScore: 65,
          minEstimatedToeicScore: null,
          maxEstimatedToeicScore: null,
        },
        create: {
          id: `f1100000-0000-4000-8000-00000000000${index + 1}`,
          profileId: recommendationProfile.id,
          skill,
          minNormalizedScore: 0,
          maxNormalizedScore: 65,
        },
      });
    }

    const profileSeeds = [
      {
        id: 'f1000000-0000-4000-8000-000000000002',
        courseId: additionalCourses[0].id,
        ruleMode: CriterionRuleMode.ANY,
        priority: 200,
        criteria: [
          { skill: ToeicSkill.LISTENING, min: 0, max: 55 },
          { skill: ToeicSkill.READING, min: 70, max: 100 },
        ],
      },
      {
        id: 'f1000000-0000-4000-8000-000000000003',
        courseId: additionalCourses[1].id,
        ruleMode: CriterionRuleMode.ANY,
        priority: 210,
        criteria: [
          { skill: ToeicSkill.READING, min: 0, max: 55 },
          { skill: ToeicSkill.LISTENING, min: 70, max: 100 },
        ],
      },
      {
        id: 'f1000000-0000-4000-8000-000000000004',
        courseId: additionalCourses[2].id,
        ruleMode: CriterionRuleMode.ALL,
        priority: 50,
        criteria: [
          { skill: ToeicSkill.LISTENING, min: 60, max: 100 },
          { skill: ToeicSkill.READING, min: 60, max: 100 },
        ],
      },
    ] as const;
    for (const profileSeed of profileSeeds) {
      const profile = await prisma.courseRecommendationProfile.upsert({
        where: { courseId: profileSeed.courseId },
        update: {
          ruleMode: profileSeed.ruleMode,
          priority: profileSeed.priority,
          isActive: true,
        },
        create: {
          id: profileSeed.id,
          courseId: profileSeed.courseId,
          ruleMode: profileSeed.ruleMode,
          priority: profileSeed.priority,
          isActive: true,
        },
      });
      for (const [index, criterion] of profileSeed.criteria.entries()) {
        await prisma.courseSkillCriterion.upsert({
          where: {
            profileId_skill: { profileId: profile.id, skill: criterion.skill },
          },
          update: {
            minNormalizedScore: criterion.min,
            maxNormalizedScore: criterion.max,
            minEstimatedToeicScore: null,
            maxEstimatedToeicScore: null,
          },
          create: {
            id: `f1400000-0000-4000-8${String(profileSeed.priority).padStart(3, '0')}-${String(index + 1).padStart(12, '0')}`,
            profileId: profile.id,
            skill: criterion.skill,
            minNormalizedScore: criterion.min,
            maxNormalizedScore: criterion.max,
          },
        });
      }
    }

    await Promise.all([
      prisma.classOffering.upsert({
        where: { id: FREE_OFFERING_ID },
        update: {
          courseId: course.id,
          instructorId: instructor.id,
          code: 'TOEIC-LR-2609-EVE',
          name: 'TOEIC L&R Foundation — Tối T3/T5',
          status: ClassOfferingStatus.IN_PROGRESS,
          modality: ClassModality.ONLINE,
          pricingType: PricingType.FREE,
          tuitionFeeVnd: 0,
          maxStudents: 25,
          totalSessions: 18,
          totalPeriods: 36,
          enrollmentStart: new Date('2026-08-10T00:00:00Z'),
          enrollmentEnd: new Date('2026-08-31T23:59:59Z'),
          classStart: new Date('2026-09-01T00:00:00Z'),
          classEnd: new Date('2026-12-20T00:00:00Z'),
        },
        create: {
          id: FREE_OFFERING_ID,
          courseId: course.id,
          instructorId: instructor.id,
          code: 'TOEIC-LR-2609-EVE',
          name: 'TOEIC L&R Foundation — Tối T3/T5',
          status: ClassOfferingStatus.IN_PROGRESS,
          modality: ClassModality.ONLINE,
          pricingType: PricingType.FREE,
          tuitionFeeVnd: 0,
          maxStudents: 25,
          totalSessions: 18,
          totalPeriods: 36,
          enrollmentStart: new Date('2026-08-10T00:00:00Z'),
          enrollmentEnd: new Date('2026-08-31T23:59:59Z'),
          classStart: new Date('2026-09-01T00:00:00Z'),
          classEnd: new Date('2026-12-20T00:00:00Z'),
        },
      }),
      prisma.classOffering.upsert({
        where: { id: PAID_OFFERING_ID },
        update: {
          courseId: course.id,
          instructorId: instructor.id,
          code: 'TOEIC-LR-2611-WE',
          name: 'TOEIC L&R Foundation — Cuối tuần',
          status: ClassOfferingStatus.OPEN,
          modality: ClassModality.HYBRID,
          pricingType: PricingType.PAID,
          tuitionFeeVnd: 750_000,
          maxStudents: 20,
          totalSessions: 20,
          totalPeriods: 40,
          enrollmentStart: new Date('2026-09-20T00:00:00Z'),
          enrollmentEnd: new Date('2026-10-25T23:59:59Z'),
          classStart: new Date('2026-11-01T00:00:00Z'),
          classEnd: new Date('2027-01-15T00:00:00Z'),
        },
        create: {
          id: PAID_OFFERING_ID,
          courseId: course.id,
          instructorId: instructor.id,
          code: 'TOEIC-LR-2611-WE',
          name: 'TOEIC L&R Foundation — Cuối tuần',
          status: ClassOfferingStatus.OPEN,
          modality: ClassModality.HYBRID,
          pricingType: PricingType.PAID,
          tuitionFeeVnd: 750_000,
          maxStudents: 20,
          totalSessions: 20,
          totalPeriods: 40,
          enrollmentStart: new Date('2026-09-20T00:00:00Z'),
          enrollmentEnd: new Date('2026-10-25T23:59:59Z'),
          classStart: new Date('2026-11-01T00:00:00Z'),
          classEnd: new Date('2027-01-15T00:00:00Z'),
        },
      }),
    ]);

    for (const [
      id,
      courseIndex,
      code,
      name,
      modality,
      pricingType,
      tuitionFeeVnd,
      maxStudents,
    ] of additionalOfferingSeeds) {
      await prisma.classOffering.upsert({
        where: { id },
        update: {
          courseId: additionalCourses[courseIndex].id,
          instructorId: instructor.id,
          code,
          name,
          status: ClassOfferingStatus.OPEN,
          modality,
          pricingType,
          tuitionFeeVnd,
          maxStudents,
          totalSessions: 16,
          totalPeriods: 32,
          enrollmentStart: new Date('2026-09-20T00:00:00Z'),
          enrollmentEnd: new Date('2026-11-05T23:59:59Z'),
          classStart: new Date('2026-11-10T00:00:00Z'),
          classEnd: new Date('2027-01-20T00:00:00Z'),
        },
        create: {
          id,
          courseId: additionalCourses[courseIndex].id,
          instructorId: instructor.id,
          code,
          name,
          status: ClassOfferingStatus.OPEN,
          modality,
          pricingType,
          tuitionFeeVnd,
          maxStudents,
          totalSessions: 16,
          totalPeriods: 32,
          enrollmentStart: new Date('2026-09-20T00:00:00Z'),
          enrollmentEnd: new Date('2026-11-05T23:59:59Z'),
          classStart: new Date('2026-11-10T00:00:00Z'),
          classEnd: new Date('2027-01-20T00:00:00Z'),
        },
      });
    }
    await prisma.classOffering.updateMany({
      where: {
        id: {
          in: [
            '11000000-0000-4000-8000-000000000005',
            '11000000-0000-4000-8000-000000000006',
          ],
        },
      },
      data: { status: ClassOfferingStatus.IN_PROGRESS },
    });

    const allOfferingIds = [
      FREE_OFFERING_ID,
      PAID_OFFERING_ID,
      ...additionalOfferingSeeds.map(([id]) => id),
    ];
    for (const [index, classOfferingId] of allOfferingIds.entries()) {
      const weekend = index % 2 === 1;
      const slots = weekend
        ? [
            { dayOfWeek: 6, startTime: '08:00:00', endTime: '10:00:00' },
            { dayOfWeek: 7, startTime: '08:00:00', endTime: '10:00:00' },
          ]
        : [
            { dayOfWeek: 2, startTime: '18:00:00', endTime: '20:00:00' },
            { dayOfWeek: 4, startTime: '18:00:00', endTime: '20:00:00' },
          ];
      for (const [slotIndex, slot] of slots.entries()) {
        const id = `12000000-0000-4000-8${String(index).padStart(3, '0')}-${String(slotIndex + 1).padStart(12, '0')}`;
        await prisma.classScheduleSlot.upsert({
          where: { id },
          update: {
            classOfferingId,
            dayOfWeek: slot.dayOfWeek,
            startTime: new Date(`1970-01-01T${slot.startTime}Z`),
            endTime: new Date(`1970-01-01T${slot.endTime}Z`),
            locationText: weekend ? 'Phòng A.203' : null,
            meetingUrl: weekend ? null : 'https://meet.google.com/',
          },
          create: {
            id,
            classOfferingId,
            dayOfWeek: slot.dayOfWeek,
            startTime: new Date(`1970-01-01T${slot.startTime}Z`),
            endTime: new Date(`1970-01-01T${slot.endTime}Z`),
            locationText: weekend ? 'Phòng A.203' : null,
            meetingUrl: weekend ? null : 'https://meet.google.com/',
          },
        });
      }
    }

    // ── VS02: Modules, Lessons, Resources ──────────────────────────
    const student = users.find((user) => user.role === UserRole.STUDENT);
    if (!student) {
      throw new Error('Development seed could not find demo student.');
    }

    // Module 1: Getting Started
    await prisma.module.upsert({
      where: { id: DEMO_MODULE_1_ID },
      update: {
        courseId: course.id,
        title: 'Getting Started',
        description: 'Welcome to the course! This module covers the basics.',
        orderIndex: 0,
      },
      create: {
        id: DEMO_MODULE_1_ID,
        courseId: course.id,
        title: 'Getting Started',
        description: 'Welcome to the course! This module covers the basics.',
        orderIndex: 0,
      },
    });

    // Module 2: Everyday Vocabulary
    await prisma.module.upsert({
      where: { id: DEMO_MODULE_2_ID },
      update: {
        courseId: course.id,
        title: 'Everyday Vocabulary',
        description: 'Learn common English words used in daily life.',
        orderIndex: 1,
      },
      create: {
        id: DEMO_MODULE_2_ID,
        courseId: course.id,
        title: 'Everyday Vocabulary',
        description: 'Learn common English words used in daily life.',
        orderIndex: 1,
      },
    });

    // Lesson 1: Welcome & Course Overview (in Module 1)
    await prisma.lesson.upsert({
      where: { id: DEMO_LESSON_1_ID },
      update: {
        moduleId: DEMO_MODULE_1_ID,
        title: 'Welcome & Course Overview',
        description: 'An introduction to the course structure and learning objectives.',
        orderIndex: 0,
        focusSkills: [ToeicSkill.LISTENING, ToeicSkill.READING],
      },
      create: {
        id: DEMO_LESSON_1_ID,
        moduleId: DEMO_MODULE_1_ID,
        title: 'Welcome & Course Overview',
        description: 'An introduction to the course structure and learning objectives.',
        orderIndex: 0,
        focusSkills: [ToeicSkill.LISTENING, ToeicSkill.READING],
      },
    });

    // Lesson 2: Basic Greetings (in Module 1)
    await prisma.lesson.upsert({
      where: { id: DEMO_LESSON_2_ID },
      update: {
        moduleId: DEMO_MODULE_1_ID,
        title: 'Basic Greetings',
        description: 'Learn how to greet people in English.',
        orderIndex: 1,
        focusSkills: [ToeicSkill.LISTENING],
      },
      create: {
        id: DEMO_LESSON_2_ID,
        moduleId: DEMO_MODULE_1_ID,
        title: 'Basic Greetings',
        description: 'Learn how to greet people in English.',
        orderIndex: 1,
        focusSkills: [ToeicSkill.LISTENING],
      },
    });

    // Lesson 3: Common Words (in Module 2)
    await prisma.lesson.upsert({
      where: { id: DEMO_LESSON_3_ID },
      update: {
        moduleId: DEMO_MODULE_2_ID,
        title: 'Common Words',
        description: 'Essential vocabulary for everyday communication.',
        orderIndex: 0,
        focusSkills: [ToeicSkill.READING],
      },
      create: {
        id: DEMO_LESSON_3_ID,
        moduleId: DEMO_MODULE_2_ID,
        title: 'Common Words',
        description: 'Essential vocabulary for everyday communication.',
        orderIndex: 0,
        focusSkills: [ToeicSkill.READING],
      },
    });

    await prisma.module.upsert({
      where: { id: DEMO_MODULE_3_ID },
      update: {
        courseId: course.id,
        title: 'TOEIC Workplace Practice',
        description: 'Ứng dụng Listening và Reading trong email, thông báo và hội thoại công sở.',
        orderIndex: 2,
      },
      create: {
        id: DEMO_MODULE_3_ID,
        courseId: course.id,
        title: 'TOEIC Workplace Practice',
        description: 'Ứng dụng Listening và Reading trong email, thông báo và hội thoại công sở.',
        orderIndex: 2,
      },
    });

    const extendedLessons = [
      [
        '30000000-0000-4000-8000-000000000004',
        DEMO_MODULE_2_ID,
        'Từ vựng văn phòng',
        'Nhận diện từ vựng thường gặp trong lịch họp và trao đổi công việc.',
        1,
        [ToeicSkill.READING],
      ],
      [
        '30000000-0000-4000-8000-000000000005',
        DEMO_MODULE_2_ID,
        'Ngữ pháp trong email',
        'Ôn cấu trúc câu dùng trong thông báo và email ngắn.',
        2,
        [ToeicSkill.READING],
      ],
      [
        '30000000-0000-4000-8000-000000000006',
        DEMO_MODULE_3_ID,
        'Nghe hội thoại công sở',
        'Luyện xác định người nói, mục đích và bước tiếp theo.',
        0,
        [ToeicSkill.LISTENING],
      ],
      [
        '30000000-0000-4000-8000-000000000007',
        DEMO_MODULE_3_ID,
        'Đọc thông báo nội bộ',
        'Đọc nhanh thông báo, lịch trình và hướng dẫn vận hành.',
        1,
        [ToeicSkill.READING],
      ],
      [
        '30000000-0000-4000-8000-000000000008',
        DEMO_MODULE_3_ID,
        'Bài luyện tổng hợp',
        'Kết hợp Listening và Reading trong một phiên luyện ngắn.',
        2,
        [ToeicSkill.LISTENING, ToeicSkill.READING],
      ],
    ] as const;
    for (const [id, moduleId, title, description, orderIndex, focusSkills] of extendedLessons) {
      await prisma.lesson.upsert({
        where: { id },
        update: { moduleId, title, description, orderIndex, focusSkills: [...focusSkills] },
        create: { id, moduleId, title, description, orderIndex, focusSkills: [...focusSkills] },
      });
    }

    // Resources for Lesson 1
    await prisma.learningResource.upsert({
      where: { id: DEMO_RESOURCE_VIDEO_ID },
      update: {
        lessonId: DEMO_LESSON_1_ID,
        title: 'Introduction Video',
        type: ResourceType.LINK,
        url: 'https://www.ets.org/toeic/test-takers/about.html',
        originalFileName: null,
        mimeType: 'text/html',
        orderIndex: 0,
        isDownloadable: false,
      },
      create: {
        id: DEMO_RESOURCE_VIDEO_ID,
        lessonId: DEMO_LESSON_1_ID,
        title: 'Introduction Video',
        type: ResourceType.LINK,
        url: 'https://www.ets.org/toeic/test-takers/about.html',
        originalFileName: null,
        mimeType: 'text/html',
        orderIndex: 0,
        isDownloadable: false,
      },
    });

    await prisma.learningResource.upsert({
      where: { id: DEMO_RESOURCE_DOC_ID },
      update: {
        lessonId: DEMO_LESSON_1_ID,
        title: 'Course Syllabus',
        type: ResourceType.DOCUMENT,
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        originalFileName: 'lo-trinh-toeic-workplace-foundations.pdf',
        mimeType: 'application/pdf',
        orderIndex: 1,
        isDownloadable: true,
      },
      create: {
        id: DEMO_RESOURCE_DOC_ID,
        lessonId: DEMO_LESSON_1_ID,
        title: 'Course Syllabus',
        type: ResourceType.DOCUMENT,
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        originalFileName: 'lo-trinh-toeic-workplace-foundations.pdf',
        mimeType: 'application/pdf',
        orderIndex: 1,
        isDownloadable: true,
      },
    });

    // Resource for Lesson 2
    await prisma.learningResource.upsert({
      where: { id: DEMO_RESOURCE_LINK_ID },
      update: {
        lessonId: DEMO_LESSON_2_ID,
        title: 'Practice Exercises',
        type: ResourceType.LINK,
        url: 'https://www.ets.org/toeic/test-takers/prepare.html',
        originalFileName: null,
        mimeType: 'text/html',
        orderIndex: 0,
        isDownloadable: false,
      },
      create: {
        id: DEMO_RESOURCE_LINK_ID,
        lessonId: DEMO_LESSON_2_ID,
        title: 'Practice Exercises',
        type: ResourceType.LINK,
        url: 'https://www.ets.org/toeic/test-takers/prepare.html',
        originalFileName: null,
        mimeType: 'text/html',
        orderIndex: 0,
        isDownloadable: false,
      },
    });

    const extendedResources = [
      [
        '40000000-0000-4000-8000-000000000004',
        DEMO_LESSON_3_ID,
        'Bảng từ vựng môi trường làm việc',
        ResourceType.DOCUMENT,
        'toeic-workplace-vocabulary.pdf',
        0,
      ],
      [
        '40000000-0000-4000-8000-000000000005',
        '30000000-0000-4000-8000-000000000006',
        'Phiếu ghi chú khi luyện nghe',
        ResourceType.DOCUMENT,
        'listening-note-sheet.pdf',
        0,
      ],
      [
        '40000000-0000-4000-8000-000000000006',
        '30000000-0000-4000-8000-000000000007',
        'Checklist đọc thông báo',
        ResourceType.DOCUMENT,
        'reading-notice-checklist.pdf',
        0,
      ],
    ] as const;
    for (const [id, lessonId, title, type, originalFileName, orderIndex] of extendedResources) {
      await prisma.learningResource.upsert({
        where: { id },
        update: {
          lessonId,
          title,
          type,
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          originalFileName,
          mimeType: 'application/pdf',
          orderIndex,
          isDownloadable: true,
        },
        create: {
          id,
          lessonId,
          title,
          type,
          url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          originalFileName,
          mimeType: 'application/pdf',
          orderIndex,
          isDownloadable: true,
        },
      });
    }

    // Demo enrollment for student in free offering
    await prisma.enrollment.upsert({
      where: {
        learnerId_classOfferingId: {
          learnerId: student.id,
          classOfferingId: FREE_OFFERING_ID,
        },
      },
      update: {
        status: EnrollmentStatus.ACTIVE,
      },
      create: {
        id: DEMO_ENROLLMENT_ID,
        learnerId: student.id,
        classOfferingId: FREE_OFFERING_ID,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await prisma.enrollment.upsert({
      where: {
        learnerId_classOfferingId: {
          learnerId: student.id,
          classOfferingId: '11000000-0000-4000-8000-000000000008',
        },
      },
      update: { status: EnrollmentStatus.ACTIVE },
      create: {
        id: M04_FULL_OFFERING_ENROLLMENT_ID,
        learnerId: student.id,
        classOfferingId: '11000000-0000-4000-8000-000000000008',
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await prisma.enrollment.upsert({
      where: {
        learnerId_classOfferingId: {
          learnerId: student.id,
          classOfferingId: PAID_OFFERING_ID,
        },
      },
      update: { status: EnrollmentStatus.PENDING_PAYMENT },
      create: {
        id: '50000000-0000-4000-8000-000000000002',
        learnerId: student.id,
        classOfferingId: PAID_OFFERING_ID,
        status: EnrollmentStatus.PENDING_PAYMENT,
      },
    });

    // Keep the learner workspace focused: one content-rich ACTIVE class and one paid boundary case.
    await prisma.enrollment.deleteMany({
      where: {
        id: '50000000-0000-4000-8000-000000000003',
        learnerId: student.id,
      },
    });

    const progressSeeds = [
      [DEMO_LESSON_1_ID, LessonProgressStatus.COMPLETED],
      [DEMO_LESSON_2_ID, LessonProgressStatus.COMPLETED],
      [DEMO_LESSON_3_ID, LessonProgressStatus.IN_PROGRESS],
    ] as const;
    for (const [lessonId, status] of progressSeeds) {
      const now = new Date('2026-09-28T09:00:00Z');
      await prisma.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId: DEMO_ENROLLMENT_ID, lessonId } },
        update: {
          status,
          lastAccessedAt: now,
          completedAt: status === LessonProgressStatus.COMPLETED ? now : null,
        },
        create: {
          enrollmentId: DEMO_ENROLLMENT_ID,
          lessonId,
          status,
          lastAccessedAt: now,
          completedAt: status === LessonProgressStatus.COMPLETED ? now : null,
        },
      });
    }

    // VS03/M02: stable assessment data plus one submitted demo attempt for the Result flow.
    for (const questionSeed of [
      ...questionSeeds,
      ...m03PlacementFoundationQuestionSeeds,
      ...m03PlacementCoreQuestionSeeds,
      ...m03PlacementAdvancedQuestionSeeds,
    ]) {
      await prisma.question.upsert({
        where: { id: questionSeed.id },
        update: {
          courseId: course.id,
          responseType: questionSeed.type,
          toeicSkill: questionSeed.toeicSkill,
          difficulty: questionSeed.difficulty,
          content: questionSeed.content,
          explanation: questionSeed.explanation,
        },
        create: {
          id: questionSeed.id,
          courseId: course.id,
          responseType: questionSeed.type,
          toeicSkill: questionSeed.toeicSkill,
          difficulty: questionSeed.difficulty,
          content: questionSeed.content,
          explanation: questionSeed.explanation,
        },
      });

      for (const [orderIndex, option] of questionSeed.options.entries()) {
        await prisma.questionOption.upsert({
          where: { id: option.id },
          update: {
            questionId: questionSeed.id,
            content: option.content,
            isCorrect: option.isCorrect,
            orderIndex,
          },
          create: {
            id: option.id,
            questionId: questionSeed.id,
            content: option.content,
            isCorrect: option.isCorrect,
            orderIndex,
          },
        });
      }
    }

    for (const form of m03PlacementForms) {
      await prisma.test.upsert({
        where: { id: form.id },
        update: {
          courseId: course.id,
          lessonId: null,
          purpose: TestPurpose.PLACEMENT,
          placementMode: PlacementMode.LR,
          title: form.title,
          description: form.description,
          status: TestStatus.PUBLISHED,
          maxAttempts: 10,
          timeLimitMinutes: form.duration,
          showResultAfterSubmit: true,
        },
        create: {
          id: form.id,
          courseId: course.id,
          lessonId: null,
          purpose: TestPurpose.PLACEMENT,
          placementMode: PlacementMode.LR,
          title: form.title,
          description: form.description,
          status: TestStatus.PUBLISHED,
          maxAttempts: 10,
          timeLimitMinutes: form.duration,
          showResultAfterSubmit: true,
        },
      });
    }

    await prisma.test.upsert({
      where: { id: DEMO_QUIZ_TEST_ID },
      update: {
        courseId: course.id,
        lessonId: DEMO_LESSON_2_ID,
        purpose: TestPurpose.IN_CLASS,
        placementMode: null,
        title: 'Kiểm tra thường kỳ 01 — Greetings & Workplace English',
        description: 'Ôn tập lời chào, cách kết thúc hội thoại và từ vựng giao tiếp nơi làm việc.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 2,
        timeLimitMinutes: 15,
        showResultAfterSubmit: true,
      },
      create: {
        id: DEMO_QUIZ_TEST_ID,
        courseId: course.id,
        lessonId: DEMO_LESSON_2_ID,
        purpose: TestPurpose.IN_CLASS,
        placementMode: null,
        title: 'Kiểm tra thường kỳ 01 — Greetings & Workplace English',
        description: 'Ôn tập lời chào, cách kết thúc hội thoại và từ vựng giao tiếp nơi làm việc.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 2,
        timeLimitMinutes: 15,
        showResultAfterSubmit: true,
      },
    });

    await prisma.test.upsert({
      where: { id: DEMO_PRACTICE_TEST_ID },
      update: {
        courseId: course.id,
        lessonId: '30000000-0000-4000-8000-000000000008',
        purpose: TestPurpose.PRACTICE_MOCK,
        placementMode: null,
        title: 'Bài luyện tổng hợp L&R',
        description: 'Phiên luyện ngắn giúp rà soát Listening và Reading trong bối cảnh công sở.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 2,
        timeLimitMinutes: 30,
        showResultAfterSubmit: true,
      },
      create: {
        id: DEMO_PRACTICE_TEST_ID,
        courseId: course.id,
        lessonId: '30000000-0000-4000-8000-000000000008',
        purpose: TestPurpose.PRACTICE_MOCK,
        placementMode: null,
        title: 'Bài luyện tổng hợp L&R',
        description: 'Phiên luyện ngắn giúp rà soát Listening và Reading trong bối cảnh công sở.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 2,
        timeLimitMinutes: 30,
        showResultAfterSubmit: true,
      },
    });

    await prisma.test.upsert({
      where: { id: DEMO_MIDTERM_TEST_ID },
      update: {
        courseId: course.id,
        lessonId: null,
        purpose: TestPurpose.IN_CLASS,
        placementMode: null,
        title: 'Kiểm tra giữa kỳ — Listening & Reading',
        description: 'Đánh giá mức độ vận dụng kiến thức sau nửa đầu chương trình.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 1,
        timeLimitMinutes: 35,
        showResultAfterSubmit: true,
      },
      create: {
        id: DEMO_MIDTERM_TEST_ID,
        courseId: course.id,
        lessonId: null,
        purpose: TestPurpose.IN_CLASS,
        placementMode: null,
        title: 'Kiểm tra giữa kỳ — Listening & Reading',
        description: 'Đánh giá mức độ vận dụng kiến thức sau nửa đầu chương trình.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 1,
        timeLimitMinutes: 35,
        showResultAfterSubmit: true,
      },
    });

    await prisma.test.upsert({
      where: { id: DEMO_FINAL_TEST_ID },
      update: {
        courseId: course.id,
        lessonId: null,
        purpose: TestPurpose.IN_CLASS,
        placementMode: null,
        title: 'Kiểm tra cuối kỳ — Workplace TOEIC',
        description: 'Bài tổng kết Listening và Reading theo các tình huống giao tiếp công sở.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 1,
        timeLimitMinutes: 45,
        showResultAfterSubmit: true,
      },
      create: {
        id: DEMO_FINAL_TEST_ID,
        courseId: course.id,
        lessonId: null,
        purpose: TestPurpose.IN_CLASS,
        placementMode: null,
        title: 'Kiểm tra cuối kỳ — Workplace TOEIC',
        description: 'Bài tổng kết Listening và Reading theo các tình huống giao tiếp công sở.',
        status: TestStatus.PUBLISHED,
        maxAttempts: 1,
        timeLimitMinutes: 45,
        showResultAfterSubmit: true,
      },
    });

    await prisma.classAssessment.upsert({
      where: { id: DEMO_CLASS_ASSESSMENT_ID },
      update: {
        classOfferingId: FREE_OFFERING_ID,
        testId: DEMO_QUIZ_TEST_ID,
        stage: AssessmentStage.PERIODIC,
        openAt: new Date('2026-09-15T00:00:00Z'),
        closeAt: new Date('2026-10-15T23:59:59Z'),
        maxAttemptsOverride: 2,
        isActive: true,
      },
      create: {
        id: DEMO_CLASS_ASSESSMENT_ID,
        classOfferingId: FREE_OFFERING_ID,
        testId: DEMO_QUIZ_TEST_ID,
        stage: AssessmentStage.PERIODIC,
        openAt: new Date('2026-09-15T00:00:00Z'),
        closeAt: new Date('2026-10-15T23:59:59Z'),
        maxAttemptsOverride: 2,
        isActive: true,
      },
    });

    await prisma.classAssessment.upsert({
      where: { id: DEMO_PRACTICE_ASSESSMENT_ID },
      update: {
        classOfferingId: FREE_OFFERING_ID,
        testId: DEMO_PRACTICE_TEST_ID,
        stage: AssessmentStage.PERIODIC,
        openAt: new Date('2026-09-15T00:00:00Z'),
        closeAt: new Date('2026-12-20T23:59:59Z'),
        maxAttemptsOverride: 2,
        isActive: true,
      },
      create: {
        id: DEMO_PRACTICE_ASSESSMENT_ID,
        classOfferingId: FREE_OFFERING_ID,
        testId: DEMO_PRACTICE_TEST_ID,
        stage: AssessmentStage.PERIODIC,
        openAt: new Date('2026-09-15T00:00:00Z'),
        closeAt: new Date('2026-12-20T23:59:59Z'),
        maxAttemptsOverride: 2,
        isActive: true,
      },
    });

    await prisma.classAssessment.upsert({
      where: { id: DEMO_MIDTERM_ASSESSMENT_ID },
      update: {
        classOfferingId: FREE_OFFERING_ID,
        testId: DEMO_MIDTERM_TEST_ID,
        stage: AssessmentStage.MIDTERM,
        openAt: new Date('2026-10-20T00:00:00Z'),
        closeAt: new Date('2026-10-25T23:59:59Z'),
        maxAttemptsOverride: 1,
        isActive: true,
      },
      create: {
        id: DEMO_MIDTERM_ASSESSMENT_ID,
        classOfferingId: FREE_OFFERING_ID,
        testId: DEMO_MIDTERM_TEST_ID,
        stage: AssessmentStage.MIDTERM,
        openAt: new Date('2026-10-20T00:00:00Z'),
        closeAt: new Date('2026-10-25T23:59:59Z'),
        maxAttemptsOverride: 1,
        isActive: true,
      },
    });

    await prisma.classAssessment.upsert({
      where: { id: DEMO_FINAL_ASSESSMENT_ID },
      update: {
        classOfferingId: FREE_OFFERING_ID,
        testId: DEMO_FINAL_TEST_ID,
        stage: AssessmentStage.FINAL,
        openAt: new Date('2026-12-10T00:00:00Z'),
        closeAt: new Date('2026-12-15T23:59:59Z'),
        maxAttemptsOverride: 1,
        isActive: true,
      },
      create: {
        id: DEMO_FINAL_ASSESSMENT_ID,
        classOfferingId: FREE_OFFERING_ID,
        testId: DEMO_FINAL_TEST_ID,
        stage: AssessmentStage.FINAL,
        openAt: new Date('2026-12-10T00:00:00Z'),
        closeAt: new Date('2026-12-15T23:59:59Z'),
        maxAttemptsOverride: 1,
        isActive: true,
      },
    });

    for (const form of m03PlacementForms) {
      const formContent = m03PlacementContentByFormId.get(form.id);
      if (!formContent) throw new Error(`Missing Placement content for form ${form.id}`);
      const groups = [];
      for (const [orderIndex, group] of formContent.groups.entries()) {
        const id = `${form.groupPrefix}${orderIndex + 1}`;
        groups.push(
          await prisma.testQuestionGroup.upsert({
            where: { id },
            update: {
              testId: form.id,
              skill: group.skill,
              orderIndex,
              title: group.title,
              instructions: group.instructions,
              stimulusText: group.stimulusText,
              audioUrl: group.audioUrl,
            },
            create: {
              id,
              testId: form.id,
              skill: group.skill,
              orderIndex,
              title: group.title,
              instructions: group.instructions,
              stimulusText: group.stimulusText,
              audioUrl: group.audioUrl,
            },
          }),
        );
      }

      for (const [orderIndex, question] of formContent.questions.entries()) {
        const id = form.questionIds[orderIndex];
        await prisma.testQuestion.upsert({
          where: { id },
          update: {
            testId: form.id,
            questionId: question.id,
            groupId: groups[Math.floor(orderIndex / 2)].id,
            orderIndex,
            points: 1,
          },
          create: {
            id,
            testId: form.id,
            questionId: question.id,
            groupId: groups[Math.floor(orderIndex / 2)].id,
            orderIndex,
            points: 1,
          },
        });
      }
    }

    for (const [orderIndex, testQuestion] of quizQuestionSeeds.entries()) {
      await prisma.testQuestion.upsert({
        where: { id: testQuestion.id },
        update: {
          testId: DEMO_QUIZ_TEST_ID,
          questionId: testQuestion.questionId,
          orderIndex,
          points: testQuestion.points,
        },
        create: {
          id: testQuestion.id,
          testId: DEMO_QUIZ_TEST_ID,
          questionId: testQuestion.questionId,
          orderIndex,
          points: testQuestion.points,
        },
      });
    }

    for (const [testId, idPrefix] of [
      [DEMO_MIDTERM_TEST_ID, '93000000-0000-4000-8000-00000000000'],
      [DEMO_FINAL_TEST_ID, '94000000-0000-4000-8000-00000000000'],
    ] as const) {
      for (const [orderIndex, testQuestion] of quizQuestionSeeds.entries()) {
        await prisma.testQuestion.upsert({
          where: { id: `${idPrefix}${orderIndex + 1}` },
          update: {
            testId,
            questionId: testQuestion.questionId,
            orderIndex,
            points: testQuestion.points,
          },
          create: {
            id: `${idPrefix}${orderIndex + 1}`,
            testId,
            questionId: testQuestion.questionId,
            orderIndex,
            points: testQuestion.points,
          },
        });
      }
    }

    for (const [orderIndex, testQuestion] of quizQuestionSeeds.entries()) {
      await prisma.testQuestion.upsert({
        where: { id: `91000000-0000-4000-8000-00000000000${orderIndex + 1}` },
        update: {
          testId: DEMO_PRACTICE_TEST_ID,
          questionId: testQuestion.questionId,
          orderIndex,
          points: testQuestion.points,
        },
        create: {
          id: `91000000-0000-4000-8000-00000000000${orderIndex + 1}`,
          testId: DEMO_PRACTICE_TEST_ID,
          questionId: testQuestion.questionId,
          orderIndex,
          points: testQuestion.points,
        },
      });
    }

    await prisma.testAttempt.upsert({
      where: { id: DEMO_SUBMITTED_ATTEMPT_ID },
      update: {
        testId: DEMO_QUIZ_TEST_ID,
        learnerId: student.id,
        enrollmentId: DEMO_ENROLLMENT_ID,
        classAssessmentId: DEMO_CLASS_ASSESSMENT_ID,
        attemptNumber: 1,
        status: TestAttemptStatus.SUBMITTED,
        score: 4,
        maxScore: 4,
        startedAt: new Date('2026-09-27T08:00:00Z'),
        submittedAt: new Date('2026-09-27T08:12:00Z'),
      },
      create: {
        id: DEMO_SUBMITTED_ATTEMPT_ID,
        testId: DEMO_QUIZ_TEST_ID,
        learnerId: student.id,
        enrollmentId: DEMO_ENROLLMENT_ID,
        classAssessmentId: DEMO_CLASS_ASSESSMENT_ID,
        attemptNumber: 1,
        status: TestAttemptStatus.SUBMITTED,
        score: 4,
        maxScore: 4,
        startedAt: new Date('2026-09-27T08:00:00Z'),
        submittedAt: new Date('2026-09-27T08:12:00Z'),
      },
    });

    const submittedAnswerSeeds = [
      [
        '92000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000006',
        ['70000000-0000-4000-8000-000000000001'],
        1,
      ],
      [
        '92000000-0000-4000-8000-000000000002',
        '90000000-0000-4000-8000-000000000007',
        ['70000000-0000-4000-8000-000000000005'],
        1,
      ],
      [
        '92000000-0000-4000-8000-000000000003',
        '90000000-0000-4000-8000-000000000008',
        ['70000000-0000-4000-8000-000000000011', '70000000-0000-4000-8000-000000000012'],
        2,
      ],
    ] as const;
    for (const [id, testQuestionId, selectedOptionIds, pointsAwarded] of submittedAnswerSeeds) {
      await prisma.testAnswer.upsert({
        where: {
          attemptId_testQuestionId: {
            attemptId: DEMO_SUBMITTED_ATTEMPT_ID,
            testQuestionId,
          },
        },
        update: {
          selectedOptionIds: [...selectedOptionIds],
          isCorrect: true,
          pointsAwarded,
        },
        create: {
          id,
          attemptId: DEMO_SUBMITTED_ATTEMPT_ID,
          testQuestionId,
          selectedOptionIds: [...selectedOptionIds],
          isCorrect: true,
          pointsAwarded,
        },
      });
    }

    // VS04: Knowledge model seed. LearnerSkillState and MasteryHistory are intentionally not seeded.
    for (const skillSeed of skillSeeds) {
      await prisma.skill.upsert({
        where: { id: skillSeed.id },
        update: {
          courseId: course.id,
          code: skillSeed.code,
          name: skillSeed.name,
          description: skillSeed.description,
          pInit: skillSeed.pInit,
          pLearn: 0.1,
          pGuess: 0.2,
          pSlip: 0.1,
        },
        create: {
          ...skillSeed,
          courseId: course.id,
          pLearn: 0.1,
          pGuess: 0.2,
          pSlip: 0.1,
        },
      });
    }

    for (const prerequisite of prerequisiteSeeds) {
      await prisma.skillPrerequisite.upsert({
        where: {
          skillId_prerequisiteSkillId: {
            skillId: prerequisite.skillId,
            prerequisiteSkillId: prerequisite.prerequisiteSkillId,
          },
        },
        update: {},
        create: prerequisite,
      });
    }

    for (const mapping of questionSkillSeeds) {
      await prisma.questionSkill.upsert({
        where: {
          questionId_skillId: {
            questionId: mapping.questionId,
            skillId: mapping.skillId,
          },
        },
        update: {},
        create: mapping,
      });
    }

    for (const mapping of lessonSkillSeeds) {
      await prisma.lessonSkill.upsert({
        where: {
          lessonId_skillId: {
            lessonId: mapping.lessonId,
            skillId: mapping.skillId,
          },
        },
        update: {},
        create: mapping,
      });
    }

    await seedM06(prisma, {
      courseId: course.id,
      classOfferingId: FREE_OFFERING_ID,
      enrollmentId: DEMO_ENROLLMENT_ID,
      learnerId: student.id,
      instructorId: instructor.id,
    });

    console.log(
      'Development seed completed with demo users, catalog, learning, assessment, and knowledge-model data.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('Development seed failed. Check the local environment configuration.', error);
  process.exitCode = 1;
});
