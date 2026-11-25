import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_CONTENT_DIR = path.join(ROOT, 'apps', 'api', 'content', 'se-academic-ops-v1');
const OUT_DOCS_DIR = path.join(ROOT, 'docs', 'v2', 'v2-road-to-99-argon-wave02');

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildAcademicOperationsDataset() {
  fs.mkdirSync(OUT_CONTENT_DIR, { recursive: true });
  fs.mkdirSync(OUT_DOCS_DIR, { recursive: true });

  const programsAndCourses = [
    {
      courseCode: 'SE-CRS-LR-450',
      slug: 'toeic-lr-foundation-450',
      title: 'TOEIC Listening & Reading Foundation 450+',
      level: 'A2',
      targetBand: '450–550 LR',
      versionCode: 'CV-LR-FOUNDATION-2026-V1',
      deliveryModes: ['OFFLINE', 'HYBRID'],
      totalSessions: 16,
      sessionDurationMinutes: 120,
      description:
        'Chương trình nền tảng củng cố ngữ pháp trọng tâm Part 5–6 và phản xạ nghe hiểu câu hỏi ngắn Part 1–2 dành cho học viên chuẩn bị đi làm.',
    },
    {
      courseCode: 'SE-CRS-LR-650',
      slug: 'toeic-lr-accelerator-650',
      title: 'TOEIC Listening & Reading Accelerator 650+',
      level: 'B1',
      targetBand: '650–785 LR',
      versionCode: 'CV-LR-ACCELERATOR-2026-V1',
      deliveryModes: ['ONLINE', 'HYBRID'],
      totalSessions: 20,
      sessionDurationMinutes: 120,
      description:
        'Chương trình tăng tốc kỹ năng suy luận hội thoại dài Part 3–4 và đọc lướt đa văn bản (Double/Triple Passages) Part 7 trong bối cảnh doanh nghiệp.',
    },
    {
      courseCode: 'SE-CRS-4SK-750',
      slug: 'toeic-four-skills-workplace-pro',
      title: 'TOEIC Four-Skills Workplace Communication Pro',
      level: 'B2',
      targetBand: '750+ LR & 150+ SW',
      versionCode: 'CV-4SK-WORKPLACE-2026-V1',
      deliveryModes: ['OFFLINE', 'ONLINE', 'HYBRID'],
      totalSessions: 24,
      sessionDurationMinutes: 120,
      description:
        'Chương trình toàn diện 4 kỹ năng Nghe – Đọc – Nói – Viết ứng dụng trong thuyết trình, xử lý sự cố vận hành và viết email thương mại quốc tế.',
    },
  ];

  const rooms = [
    {
      code: 'D3-P301',
      name: 'Phòng Học Đa Phương Tiện 301 — Cơ sở Quận 3',
      capacity: 30,
      capabilities: ['PROJECTOR', 'AUDIO_SYSTEM'],
      campus: 'Cơ sở Quận 3, TP.HCM',
    },
    {
      code: 'D3-P302',
      name: 'Phòng Luyện Nghe Nói Cabin 302 — Cơ sở Quận 3',
      capacity: 24,
      capabilities: ['PROJECTOR', 'AUDIO_SYSTEM', 'LAB'],
      campus: 'Cơ sở Quận 3, TP.HCM',
    },
    {
      code: 'D1-P405',
      name: 'Phòng Hội Thảo Thương Mại 405 — Cơ sở Quận 1',
      capacity: 35,
      capabilities: ['PROJECTOR', 'AUDIO_SYSTEM', 'STREAMING'],
      campus: 'Cơ sở Quận 1, TP.HCM',
    },
  ];

  const classSections = [
    {
      sectionCode: 'SEC-W01-LISTENING-WORKPLACE',
      orderIndex: 0,
      title: 'Tuần 1: Chiến lược Nghe Hiểu Hội Thoại Công Sở (Part 2 & Part 3)',
      introduction:
        'Nắm vững cấu trúc câu hỏi gián tiếp trong Part 2 và kỹ thuật bắt từ khóa chuyển ý (However, Actually, As soon as) trong hội thoại 2–3 người nói ở Part 3.',
      activities: [
        {
          activityCode: 'ACT-LESSON-W01-01',
          type: 'LESSON',
          title: 'Bài học 1.1: Phản xạ Câu trả lời Gián tiếp & Bẫy Đồng âm trong TOEIC Part 2',
          introduction:
            'Phân tích 5 mẫu câu trả lời gián tiếp thường gặp nhất trong môi trường văn phòng và kho vận.',
          contentMarkdown: `### 1. Mục tiêu bài học (Learning Objectives)
- Nhận diện câu trả lời gián tiếp (**Indirect Responses**) cho câu hỏi \`When\`, \`Where\`, \`Who\` và \`Yes/No\`.
- Loại trừ phương án bẫy lặp từ (**Word Repetition Trap**) hoặc đồng âm khác nghĩa (**Homophones**).

### 2. Cấu trúc trọng tâm
| Loại câu hỏi | Bẫy thường gặp | Mẫu câu trả lời đúng thực tế |
|---|---|---|
| \`Where should I put the signed invoices?\` | Lặp động từ *sign* ở ngữ cảnh khác | \`Leave them on Ms. Pham's desk in Accounting.\` |
| \`Have the replacement toner cartridges arrived?\` | Trả lời \`Yes/No\` kèm thông tin sai chủ ngữ | \`The reception desk just signed for the parcel.\` |
| \`Why was the supplier meeting moved to Friday?\` | Trả lời bằng mốc giờ thay vì nguyên nhân | \`Because our lead engineer is visiting the Binh Duong plant.\` |

### 3. Ghi chú thực hành trên lớp
Học viên nghe 10 câu hỏi ngắn tốc độ chuẩn và ghi lại **động từ chính + danh từ đích** trước khi chọn đáp án A/B/C.`,
        },
        {
          activityCode: 'ACT-RESOURCE-W01-02',
          type: 'RESOURCE',
          title: 'Tài nguyên 1.2: Bảng Tổng hợp 120 Cụm Từ Đồng Nghĩa Paraphrase Part 3–4 (HTTPS)',
          introduction:
            'Tài liệu tra cứu các cặp từ thay thế (Paraphrasing Pairs) giữa lời thoại âm thanh và câu hỏi in trên đề.',
          resourceUrl: 'https://smartenglish.edu.vn/resources/toeic-part3-paraphrase-handbook-v2.pdf',
          contentMarkdown:
            'Tài liệu chuẩn hóa danh mục 120 cụm từ đồng nghĩa thương mại: *postpone = push back = reschedule*, *complimentary = free of charge*, *inspect = check over*.',
        },
        {
          activityCode: 'ACT-ASSIGNMENT-W01-03',
          type: 'ASSIGNMENT',
          title: 'Bài tập 1.3: Viết Email Điều chỉnh Lịch Giao Thiết Bị Văn Phòng (120–150 từ)',
          introduction:
            'Đóng vai Điều phối viên Mua hàng viết email phản hồi nhà cung cấp ModuWork về việc dời lịch lắp đặt 12 bàn làm việc.',
          contentMarkdown: `### Đề bài thực hành (Workplace Writing Scenario)
Bạn là **Chuyên viên Điều phối Văn phòng** tại Công ty Luật Veritas (Quận 1). Nhà cung cấp nội thất **ModuWork** vừa gửi thông báo giao 12 bàn làm việc vào sáng thứ Năm (09:00–11:30).

Hãy viết một email hoàn chỉnh (120–150 từ) gửi \`orders@moduwork.vn\` bao gồm đủ 3 ý:
1. Xác nhận đã nhận thông báo đơn hàng \`#MW-4829\`.
2. Đề nghị đổi khung giờ lắp đặt sang **14:00–16:30 cùng ngày** vì thang máy tải hàng tòa nhà bảo trì buổi sáng.
3. Hỏi rõ tên kỹ thuật viên trưởng để đăng ký thẻ ra vào tại quầy an ninh tầng trệt.`,
          sampleSubmissionText: `Subject: Delivery Window Adjustment for Order #MW-4829 — Veritas Legal District 1

Dear ModuWork Dispatch Team,

Thank you for confirming the shipment of our twelve ModuWork Sit-Stand Desks under Order #MW-4829 scheduled for Thursday, November 6.

Because our building management is conducting mandatory maintenance on the freight elevator between 8:30 A.M. and 12:00 P.M. that morning, we kindly request moving the delivery and Room 602 assembly window to 2:00 P.M.–4:30 P.M. on the same day. The loading bay will be reserved exclusively for your truck during the afternoon slot.

Additionally, could you please share the full names and ID numbers of your two installation technicians by Wednesday afternoon so our reception desk can issue visitor access badges in advance?

Best regards,
Nguyen Minh Khang
Operations Coordinator, Veritas Legal`,
          rubric: {
            title: 'Rubric Chấm Bài Viết Email Thương Mại Chuẩn TOEIC Writing W6–W7',
            criteria: [
              {
                title: 'Mức độ hoàn thành 3 yêu cầu công việc (Task Fulfillment)',
                description:
                  'Nêu đủ mã đơn hàng, lý do đổi khung giờ chiều và yêu cầu thông tin kỹ thuật viên.',
                maxScore: 40,
              },
              {
                title: 'Tổ chức bố cục & Từ nối mạch lạc (Organization & Coherence)',
                description:
                  'Có dòng tiêu đề rõ ràng, lời chào, chia đoạn hợp lý và kết thư lịch sự.',
                maxScore: 30,
              },
              {
                title: 'Từ vựng thương mại & Độ chính xác ngữ pháp (Vocabulary & Grammar)',
                description:
                  'Sử dụng đúng cấu trúc câu đề nghị lịch sự và thì tương lai/hiện tại tiếp diễn.',
                maxScore: 30,
              },
            ],
          },
        },
        {
          activityCode: 'ACT-QUIZ-W01-04',
          type: 'QUIZ',
          title: 'Quiz 1.4: Kiểm tra Ngữ pháp & Từ vựng Hợp đồng Thương mại (Part 5–6)',
          introduction:
            'Bài trắc nghiệm 1 đáp án đúng có tính giờ, gắn nhãn kiến thức (KnowledgeTag) và được Học vụ độc lập duyệt trước khi mở cho lớp.',
          timeLimitSeconds: 900,
          maxAttempts: 2,
          knowledgeTag: {
            code: 'KT-WORKPLACE-CONTRACT-GRAMMAR',
            title: 'Ngữ pháp & Từ vựng Hợp đồng Thương mại (Part 5–6)',
            articleSlug: 'ngu-phap-tu-vung-hop-dong-thuong-mai-part-5-6',
          },
          questions: [
            {
              stem: 'All supplier invoices must be approved by the department head _______ payment can be released by accounting.',
              options: [
                { content: 'before', isCorrect: true },
                { content: 'during', isCorrect: false },
                { content: 'despite', isCorrect: false },
                { content: 'rapidly', isCorrect: false },
              ],
              explanation:
                'Cần liên từ phụ thuộc chỉ thời gian “before” đứng trước mệnh đề “payment can be released”.',
            },
            {
              stem: 'The updated warehouse safety manual provides _______ instructions on operating electric pallet jacks.',
              options: [
                { content: 'detail', isCorrect: false },
                { content: 'detailed', isCorrect: true },
                { content: 'detailing', isCorrect: false },
                { content: 'details', isCorrect: false },
              ],
              explanation:
                'Cần tính từ “detailed” (chi tiết) đứng trước danh từ số nhiều “instructions”.',
            },
            {
              stem: 'Should you require technical assistance during the webinar, please _______ our support team via the live chat box.',
              options: [
                { content: 'contact', isCorrect: true },
                { content: 'contacted', isCorrect: false },
                { content: 'contacting', isCorrect: false },
                { content: 'to contact', isCorrect: false },
              ],
              explanation:
                'Sau “please” trong câu mệnh lệnh dùng động từ nguyên mẫu “contact”.',
            },
          ],
        },
        {
          activityCode: 'ACT-ATTENDANCE-W01-05',
          type: 'ATTENDANCE',
          title: 'Điểm danh 1.5: Điểm danh theo TeachingSession chính thức (Mã phiên 20-hex)',
          introduction:
            'Liên kết trực tiếp tới phiên điểm danh của buổi học chính thức; học viên nhập mã phiên 20 ký tự hex trong khung giờ mở.',
        },
        {
          activityCode: 'ACT-ONLINE-SESSION-W01-06',
          type: 'ONLINE_SESSION',
          title: 'Buổi học online 1.6: Đề xuất & Công bố Google Meet HTTPS cho buổi học kết hợp',
          introduction:
            'Giảng viên đề xuất đường dẫn Google Meet HTTPS cho buổi học; Học vụ độc lập phê duyệt trước khi hiển thị cho học viên và Thanh tra.',
          proposedMeetUrl: 'https://meet.google.com/seh-wave-two',
        },
      ],
    },
    {
      sectionCode: 'SEC-W02-READING-MULTI-PASSAGE',
      orderIndex: 1,
      title: 'Tuần 2: Đọc Hiểu Đa Văn Bản (Double & Triple Passages) trong TOEIC Part 7',
      introduction:
        'Thực hành kỹ năng đối chiếu thông tin chéo (Cross-Reference) giữa thông báo, email phản hồi và bảng biểu lịch trình.',
      activities: [
        {
          activityCode: 'ACT-LESSON-W02-01',
          type: 'LESSON',
          title: 'Bài học 2.1: Kỹ thuật Liên kết Dữ kiện Chéo (Cross-Referencing) trong Part 7',
          introduction:
            'Phương pháp giải nhanh các câu hỏi kết hợp thông tin từ 2 hoặc 3 văn bản liên quan.',
          contentMarkdown: `### Quy trình 3 bước xử lý câu hỏi Cross-Reference
1. **Xác định thực thể chung (Anchor Entity)**: Mã đơn hàng, tên nhân sự, ngày sự kiện hoặc mã phòng họp xuất hiện ở cả hai văn bản.
2. **Đối chiếu sự thay đổi (Delta Check)**: So sánh lịch gốc ở Văn bản 1 với thông báo điều chỉnh ở Văn bản 2.
3. **Kiểm tra điều kiện loại trừ (Exclusion Clause)**: Đặc biệt lưu ý các dòng ghi chú (*Note*, *Warranty Exclusion*, *Exception*) ở cuối biểu mẫu.`,
        },
        {
          activityCode: 'ACT-RESOURCE-W02-02',
          type: 'RESOURCE',
          title: 'Tài nguyên 2.2: Bộ Mẫu Biểu Hóa Đơn, Lịch Hội Thảo & Biên Bản Bảo Hành (HTTPS)',
          introduction:
            'Tập hợp 15 mẫu văn bản doanh nghiệp chuẩn hóa phục vụ luyện đọc tốc độ cao.',
          resourceUrl: 'https://smartenglish.edu.vn/resources/toeic-part7-multi-passage-pack-v2.pdf',
          contentMarkdown:
            'Bao gồm 10 văn bản đơn, 2 cặp văn bản kép và 3 cụm ba văn bản có giải thích chi tiết bằng tiếng Việt.',
        },
      ],
    },
  ];

  const teachingSessionsAndOps = [
    {
      sessionCode: 'SESS-01-NORMAL-ONLINE',
      modality: 'ONLINE',
      startsAtLocal: '2026-11-12T18:30:00+07:00',
      endsAtLocal: '2026-11-12T20:30:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
      approvedMeetUrl: 'https://meet.google.com/seh-wave-two',
      attendanceScenario:
        'Buổi học chính thức #1: GV kích hoạt điểm danh lớp, mở cửa sổ điểm danh, xoay mã 20-hex; HV1 điểm danh hợp lệ PRESENT; HV2 gửi yêu cầu đính chính có minh chứng và được duyệt.',
      inspectionScenario:
        'HVU phân công Thanh tra (TT) ca trực buổi #1; TT check-in/out ca trực, bấm giờ quan sát thực tế, nộp biên bản TT-REPORTED; HVU độc lập nghiệm thu APPROVE 120 phút.',
    },
    {
      sessionCode: 'SESS-02-RESCHEDULED-HYBRID',
      modality: 'HYBRID',
      startsAtLocal: '2026-11-14T18:30:00+07:00',
      endsAtLocal: '2026-11-14T20:30:00+07:00',
      rescheduledToStartsAtLocal: '2026-11-16T18:30:00+07:00',
      rescheduledToEndsAtLocal: '2026-11-16T20:30:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
      approvedMeetUrl: 'https://meet.google.com/seh-make-upx',
      attendanceScenario:
        'Buổi học chính thức #2: GV gửi ngoại lệ RESCHEDULE do công tác đột xuất; HVU độc lập phê duyệt và định tuyến sang buổi học thay thế revision mới mà không làm mất danh sách lớp.',
      inspectionScenario:
        'Buổi học sau khi đổi lịch: TT nộp báo cáo giám sát, GV gửi phản hồi DISPUTE có lý giải, HVU độc lập nghiệm thu PARTIAL (100 phút) kèm quyết định xử lý khiếu nại.',
    },
  ];

  const completionPolicyPack = {
    policyCode: 'POL-TOEIC-4SK-TEST-V1',
    title: 'Chuẩn Hoàn Thành Khóa Học TOEIC Workplace Pro (W09 Test Governance Policy)',
    isTestPolicy: true,
    governanceNote:
      'Chính sách gắn nhãn isTestPolicy=true phục vụ kiểm thử E2E trên DB cô lập; mọi lớp/ghi danh chưa đủ dữ liệu thật ở môi trường chuẩn vẫn giữ nguyên PENDING_POLICY / NOT_ELIGIBLE.',
    criteria: [
      {
        criterionId: 'CRIT_W03_GRADE',
        domain: 'W03_GRADE',
        required: true,
        minimumNumericValue: 70,
        description: 'Điểm trung bình các bài Assignment/Quiz đã công bố (W03) đạt tối thiểu 70%.',
      },
      {
        criterionId: 'CRIT_W06_ATTENDANCE',
        domain: 'W06_ATTENDANCE',
        required: true,
        minimumNumericValue: 80,
        description: 'Tỷ lệ có mặt tại các buổi học TeachingSession chính thức (W06) đạt từ 80% trở lên.',
      },
      {
        criterionId: 'CRIT_W07_ENTITLEMENT',
        domain: 'W07_ENTITLEMENT',
        required: true,
        description: 'Trạng thái ghi danh và quyền lợi học vụ/tài chính (W07) đang ACTIVE hợp lệ.',
      },
    ],
  };

  const dataset = {
    schemaVersion: 1,
    datasetCode: 'SE-ACADEMIC-OPS-V1',
    origin: 'SMART_ENGLISH_ORIGINAL_ACADEMIC_OPERATIONS',
    generatedAt: '2026-11-09T17:45:00+07:00',
    programsAndCourses,
    rooms,
    classSections,
    teachingSessionsAndOps,
    completionPolicyPack,
  };

  const jsonText = JSON.stringify(dataset, null, 2);
  const datasetPath = path.join(OUT_CONTENT_DIR, 'SE_Academic_Operations_Dataset.json');
  fs.writeFileSync(datasetPath, jsonText);

  // Build CSV inventory
  const csvRows = [
    [
      'Order',
      'Category',
      'Code',
      'TypeOrModality',
      'Title',
      'TargetOrScope',
      'GovernanceState',
      'Origin',
    ].join(','),
  ];
  let order = 0;
  for (const c of programsAndCourses) {
    order += 1;
    csvRows.push(
      [
        order,
        'COURSE_VERSION',
        c.versionCode,
        c.level,
        c.title,
        c.targetBand,
        'GOVERNED_ORIGINAL',
        'SMART_ENGLISH_ORIGINAL',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  for (const r of rooms) {
    order += 1;
    csvRows.push(
      [
        order,
        'ROOM',
        r.code,
        r.capabilities.join('|'),
        r.name,
        `Capacity ${r.capacity}`,
        'ACTIVE',
        'SMART_ENGLISH_ORIGINAL',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  for (const sec of classSections) {
    order += 1;
    csvRows.push(
      [
        order,
        'CLASS_SECTION',
        sec.sectionCode,
        `WEEK_${sec.orderIndex + 1}`,
        sec.title,
        `${sec.activities.length} activities`,
        'PUBLISHED_IN_CLASS',
        'SMART_ENGLISH_ORIGINAL',
      ]
        .map(csvEscape)
        .join(','),
    );
    for (const act of sec.activities) {
      order += 1;
      csvRows.push(
        [
          order,
          'CLASS_ACTIVITY',
          act.activityCode,
          act.type,
          act.title,
          sec.sectionCode,
          'PUBLISHED_GOVERNED',
          'SMART_ENGLISH_ORIGINAL',
        ]
          .map(csvEscape)
          .join(','),
      );
    }
  }
  for (const s of teachingSessionsAndOps) {
    order += 1;
    csvRows.push(
      [
        order,
        'TEACHING_SESSION_SCENARIO',
        s.sessionCode,
        s.modality,
        `${s.startsAtLocal} (${s.timezone})`,
        s.approvedMeetUrl,
        'APPROVED_PUBLISHED',
        'SMART_ENGLISH_ORIGINAL',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  order += 1;
  csvRows.push(
    [
      order,
      'COMPLETION_POLICY',
      completionPolicyPack.policyCode,
      'W09_TEST_POLICY',
      completionPolicyPack.title,
      'W03>=70% | W06>=80% | W07=ACTIVE',
      'APPROVED_TEST_ISOLATED',
      'SMART_ENGLISH_ORIGINAL',
    ]
      .map(csvEscape)
      .join(','),
  );

  fs.writeFileSync(
    path.join(OUT_DOCS_DIR, 'ORIGINAL_ACADEMIC_OPERATIONS_INVENTORY.csv'),
    csvRows.join('\n') + '\n',
  );

  const md = `# Dữ Liệu Học Vụ, Lớp Học, Buổi Học & Chứng Chỉ Nguyên Gốc — ROAD99 Wave 02

- **Mã gói dữ liệu**: \`SE-ACADEMIC-OPS-V1\`
- **Đường dẫn lưu trữ bền vững trong repo**: \`apps/api/content/se-academic-ops-v1/SE_Academic_Operations_Dataset.json\`
- **SHA-256**: \`${sha256Text(jsonText)}\`
- **Nguồn gốc**: \`SMART_ENGLISH_ORIGINAL_ACADEMIC_OPERATIONS\` — 100% biên soạn nguyên gốc phục vụ vận hành đào tạo tiếng Anh doanh nghiệp & TOEIC 4 kỹ năng tại Smart English V2, tuyệt đối không dùng chuỗi rác (\`Test 1\`, \`Demo\`, \`Lorem ipsum\`).

## 1. Danh mục Chương trình, Khóa học, Phiên bản (\`CourseVersion\`) & Phòng học (\`Room\`)

| Mã phiên bản | Tên chương trình | Trình độ CEFR | Mục tiêu đầu ra | Số buổi chuẩn | Hình thức |
|---|---|---|---|---:|---|
${programsAndCourses
  .map(
    (c) =>
      `| \`${c.versionCode}\` | **${c.title}** | \`${c.level}\` | ${c.targetBand} | ${c.totalSessions} buổi (${c.sessionDurationMinutes}p) | \`${c.deliveryModes.join(', ')}\` |`,
  )
  .join('\n')}

| Mã phòng | Tên phòng học | Cơ sở | Sức chứa | Thiết bị chuẩn (\`RoomCapability\`) |
|---|---|---|---:|---|
${rooms
  .map(
    (r) =>
      `| \`${r.code}\` | ${r.name} | ${r.campus} | ${r.capacity} HV | \`${r.capabilities.join(', ')}\` |`,
  )
  .join('\n')}

## 2. Cấu trúc Chủ đề (\`Section\`) & 6 Loại Hoạt Động Lớp Học (\`Activity Chooser\`)

| Chủ đề (\`Section\`) | Mã hoạt động | Loại (\`ActivityType\`) | Tên hoạt động / Tài nguyên | Cơ chế quản trị & Backend thật |
|---|---|---|---|---|
${classSections
  .flatMap((s) =>
    s.activities.map(
      (a) =>
        `| \`${s.sectionCode}\` | \`${a.activityCode}\` | \`${a.type}\` | **${a.title}** | ${a.introduction} |`,
    ),
  )
  .join('\n')}

## 3. Kịch bản Lịch học chính thức (\`TeachingSession\`), Điểm danh (\`W06\`), Thanh tra (\`W08\`) & Chứng chỉ (\`W09\`)

1. **Buổi học chính thức #1 (\`SESS-01-NORMAL-ONLINE\`)**:
   - Hình thức \`ONLINE\` trong múi giờ \`Asia/Ho_Chi_Minh\`, giảng viên đề xuất link \`https://meet.google.com/seh-wave-two\`, Học vụ độc lập phê duyệt.
   - Giảng viên bật điểm danh lớp, mở cửa sổ điểm danh, tạo/xoay mã phiên 20-hex; Học viên ghi danh check-in hợp lệ (\`PRESENT\`); Học viên thứ hai nộp yêu cầu đính chính có bằng chứng và được duyệt.
   - Học vụ phân công Thanh tra (\`TT\`); Thanh tra check-in/check-out ca trực, bấm giờ quan sát thực tế, nộp biên bản \`TT-REPORTED\`; Học vụ độc lập nghiệm thu \`APPROVE\` 120 phút.
2. **Buổi học chính thức #2 (\`SESS-02-RESCHEDULED-HYBRID\`)**:
   - Giảng viên gửi đề nghị ngoại lệ \`RESCHEDULE\` có lý do chính đáng; Học vụ độc lập phê duyệt và định tuyến sang buổi học thay thế revision mới (\`https://meet.google.com/seh-make-upx\`) giữ nguyên danh sách lớp và lịch sử.
   - Thanh tra nộp báo cáo giám sát, Giảng viên gửi phản hồi \`DISPUTE\` có lý giải, Học vụ độc lập nghiệm thu \`PARTIAL\` (100 phút) kèm lý do giải quyết tranh chấp.
3. **Chính sách hoàn thành & Chứng chỉ có quản trị (\`POL-TOEIC-4SK-TEST-V1\`)**:
   - Đánh dấu rõ \`isTestPolicy = true\` trên môi trường kiểm thử cô lập.
   - Kết nối trực tiếp 3 nguồn bằng chứng thật: \`W03_GRADE >= 70%\`, \`W06_ATTENDANCE >= 80%\`, \`W07_ENTITLEMENT = ACTIVE\`.
   - Đảm bảo Maker–Checker đầy đủ ở cả 3 bước: Soạn/Duyệt chính sách (\`UCV2-46\`), Xét điều kiện (\`ELIGIBLE\`), và Phát hành/Tra cứu/Thu hồi chứng chỉ (\`UCV2-47\`) + hiển thị minh bạch cho Học viên (\`UCV2-28\`).
`;

  fs.writeFileSync(path.join(OUT_DOCS_DIR, 'ORIGINAL_ACADEMIC_OPERATIONS_DATA.md'), md);
  return { dataset, inventoryCount: order, sha256: sha256Text(jsonText) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = buildAcademicOperationsDataset();
  console.log(JSON.stringify({ inventoryCount: res.inventoryCount, sha256: res.sha256 }, null, 2));
}
