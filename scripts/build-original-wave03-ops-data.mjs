import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WAVE03_ORIGINAL_DATA = {
  supportTopics: [
    {
      code: 'TU_VAN_LO_TRINH_TOEIC',
      name: 'Tư vấn lộ trình TOEIC 4 kỹ năng & xếp lớp đầu vào',
      description:
        'Hỗ trợ học viên lựa chọn chương trình TOEIC Listening-Reading và Speaking-Writing phù hợp với trình độ hiện tại và mục tiêu điểm số đầu ra.',
    },
    {
      code: 'HO_TRO_HOC_PHI_SEPAY',
      name: 'Hướng dẫn đóng học phí, VietQR SePay và đối soát biên lai',
      description:
        'Giải đáp thắc mắc về mức học phí niêm yết, nội dung chuyển khoản VietQR, tải minh chứng thanh toán và tra cứu biên lai thu tiền.',
    },
    {
      code: 'DIEU_CHINH_GHI_DANH_LICH_HOC',
      name: 'Yêu cầu bảo lưu, chuyển lớp và hỗ trợ lịch học trực tuyến',
      description:
        'Tiếp nhận đề nghị chuyển ca học, rút hồ sơ trước khai giảng và hỗ trợ kỹ thuật phòng học trực tuyến Google Meet.',
    },
  ],
  supportTickets: [
    {
      itemCode: 'W03-SUP-01',
      domain: 'CSKH_ADMISSIONS',
      uc: 'UCV2-09, UCV2-10',
      subject: 'Tư vấn chọn lớp TOEIC Foundation 450+ buổi tối cho sinh viên năm 3',
      detail:
        'Em hiện đạt khoảng 360 điểm Listening & Reading qua bài kiểm tra thử và muốn đăng ký lớp học buổi tối thứ 2-4-6 để kịp chuẩn đầu ra trường đại học trong 3 tháng tới. Nhờ bộ phận Tư vấn giới thiệu lớp còn chỗ và hướng dẫn thủ tục nhập học.',
      counselorReply:
        'Chào bạn, Trung tâm đã kiểm tra kết quả đầu vào và lịch khai giảng hiện hành. Lớp TOEIC Foundation 450+ ca tối 19:30–21:00 (Thứ 2-4-6) hiện còn chỉ tiêu tuyển sinh và rất phù hợp với nền tảng 360 điểm của bạn. Tư vấn viên đã lập hồ sơ đề xuất lớp để Học vụ xét duyệt.',
      consentSummary:
        'Học viên xác nhận đồng ý nhận thông tin lộ trình học tập, lịch khai giảng và thông báo học phí qua email cá nhân và số điện thoại đã đăng ký.',
    },
    {
      itemCode: 'W03-SUP-02',
      domain: 'CSKH_ADMISSIONS',
      uc: 'UCV2-09, UCV2-10, UCV2-11',
      subject: 'Hỏi về thủ tục chuyển khoản học phí và thời gian kích hoạt lớp TOEIC 650+',
      detail:
        'Em đã được Tư vấn viên hướng dẫn chọn lớp Luyện thi TOEIC Trung cấp 650+. Cho em hỏi sau khi Học vụ duyệt hồ sơ thì em có thể tải ảnh chụp ủy nhiệm chi ngân hàng lên hệ thống ở đâu và bao lâu được vào lớp học LMS?',
      counselorReply:
        'Sau khi bộ phận Học vụ phê duyệt hồ sơ nhập học, hệ thống sẽ tự động mở mục Nghĩa vụ học phí tại trang Tuyển sinh của bạn. Bạn chỉ cần tải minh chứng chuyển khoản theo đúng số tiền niêm yết; ngay khi Thu ngân xác nhận đối soát, nút Kích hoạt vào lớp LMS sẽ mở ngay lập tức.',
      consentSummary:
        'Học viên đồng ý cung cấp thông tin liên hệ và cho phép lưu trữ lịch sử tư vấn phục vụ đối soát hồ sơ nhập học.',
    },
  ],
  admissionsApplications: [
    {
      itemCode: 'W03-ADM-01',
      domain: 'ADMISSIONS',
      uc: 'UCV2-11, UCV2-12, UCV2-13',
      classCode: 'TOEIC-FOUND-450-K12',
      className: 'Lớp TOEIC Foundation 450+ · Ca tối Thứ 2-4-6',
      learnerGoal:
        'Hoàn thành mục tiêu TOEIC 480–520 điểm để xét chuẩn ngoại ngữ tốt nghiệp đại học khối Kinh tế – Kỹ thuật.',
      counselorAssessment:
        'Học viên có nền tảng ngữ pháp cơ bản ổn định, cần tăng tốc kỹ năng nghe Part 2-3 và đọc hiểu email công sở Part 7.',
      academicDecisionReason:
        'Đủ điều kiện trình độ đầu vào theo khung chương trình TOEIC Foundation; sĩ số lớp hiện tại còn chỗ trống, đồng ý duyệt hồ sơ nhập học và phát sinh nghĩa vụ học phí chuẩn.',
      publishedPriceVnd: 1850000,
    },
    {
      itemCode: 'W03-ADM-02',
      domain: 'ADMISSIONS',
      uc: 'UCV2-12, UCV2-13',
      classCode: 'TOEIC-INT-650-K08',
      className: 'Lớp TOEIC Chiến lược 650+ · Ca tối Thứ 3-5-7',
      learnerGoal:
        'Nâng điểm từ 515 lên 680+ để ứng tuyển vị trí Chuyên viên chuỗi cung ứng tại doanh nghiệp FDI.',
      counselorAssessment:
        'Đã hoàn thành bài kiểm tra xếp lớp 4 kỹ năng; phù hợp lộ trình tăng tốc giải đề và luyện phản xạ Speaking – Writing thương mại.',
      academicDecisionReason:
        'Xác nhận hồ sơ hợp lệ và phê duyệt điều chỉnh nguyện vọng lịch học trước khi đóng học phí theo đúng quy chế đào tạo.',
      publishedPriceVnd: 2450000,
    },
  ],
  financeRecords: [
    {
      itemCode: 'W03-FIN-01',
      domain: 'FINANCE_CASHIER',
      uc: 'UCV2-14, UCV2-15, UCV2-16',
      referenceCode: 'UNC-VCB-20261109-88241',
      amountVnd: 1850000,
      kind: 'EXACT_TUITION_PAYMENT',
      learnerNote:
        'Chuyển khoản đủ học phí lớp TOEIC Foundation 450+ theo đúng mức học phí niêm yết của phiên bản chương trình đã công bố.',
      cashierVerifyReason:
        'Đã đối soát khớp 100% số tiền 1.850.000 VNĐ và mã tham chiếu giao dịch ngân hàng trên sao kê trung tâm.',
    },
    {
      itemCode: 'W03-FIN-02',
      domain: 'FINANCE_CASHIER',
      uc: 'UCV2-15, UCV2-17',
      referenceCode: 'UNC-TCB-20261109-99412',
      amountVnd: 2050000,
      kind: 'OVERPAYMENT_AND_REFUND_ADJUSTMENT',
      learnerNote:
        'Học viên chuyển khoản dư 200.000 VNĐ so với mức học phí chuẩn 1.850.000 VNĐ do cộng nhầm phí tài liệu in.',
      cashierVerifyReason:
        'Ghi nhận khoản thu học phí chính thức 1.850.000 VNĐ, tách phần tiền thừa 200.000 VNĐ vào trạng thái chờ xử lý hoàn trả (CREDIT_PENDING) và lập phiếu điều chỉnh hoàn tiền có kiểm soát độc lập.',
    },
    {
      itemCode: 'W03-FIN-03',
      domain: 'FINANCE_SEPAY',
      uc: 'UCV2-14, UCV2-16',
      referenceCode: 'SEV26A12734045E901D06783',
      amountVnd: 400000,
      kind: 'SEPAY_HMAC_RECONCILIATION_CONTRACT',
      learnerNote:
        'Đối soát tự động qua cổng VietQR SePay: kiểm tra chữ ký HMAC-SHA256 timing-safe, phân loại giao dịch đúng số tiền/thiếu tiền/dư tiền và bảo toàn tuyệt đối guard 503 trên môi trường chưa cấp khóa LIVE.',
      cashierVerifyReason:
        'Chỉ ghi nhận trạng thái chờ đối soát khi chữ ký hợp lệ và khớp mã đơn hàng duy nhất.',
    },
  ],
  academicCurriculumAndRooms: [
    {
      itemCode: 'W03-ACD-01',
      domain: 'CURRICULUM_PROGRAM',
      uc: 'UCV2-38',
      code: 'PROG-TOEIC-BIZ-650',
      title: 'Chương trình TOEIC Giao tiếp & Đọc hiểu Thương mại Quốc tế 650+',
      versionTitle: 'Phiên bản chuẩn hóa Học kỳ Mùa Thu 2026 (24 buổi · 48 giờ tín chỉ)',
      syllabusSummary:
        'Cấu trúc 6 học phần tích hợp: Thư tín thương mại, Đàm phán hợp đồng mua hàng, Báo cáo tài chính nội bộ, Lịch trình công tác quốc tế, Thuyết trình số liệu và Phản hồi khiếu nại khách hàng.',
      publishedPriceVnd: 2450000,
    },
    {
      itemCode: 'W03-ACD-02',
      domain: 'ACADEMIC_ROOMS',
      uc: 'UCV2-40',
      code: 'ROOM-LAB-A302',
      title: 'Phòng Lab Nghe – Nói Đa phương tiện A302 (Cơ sở Quận 1)',
      capacity: 32,
      equipmentSummary:
        '32 tai nghe chống ồn chuẩn thi quốc tế, màn hình tương tác 75 inch, hệ thống thu âm hội thoại cabin độc lập và camera hội nghị trực tuyến.',
      status: 'AVAILABLE',
    },
    {
      itemCode: 'W03-ACD-03',
      domain: 'ACADEMIC_ROOMS',
      uc: 'UCV2-40',
      code: 'ROOM-ONLINE-STUDIO-04',
      title: 'Phòng Studio Trực tuyến Hybrid 04 (Đang bảo trì thiết bị âm thanh)',
      capacity: 25,
      equipmentSummary:
        'Hệ thống livestream hai màn hình, bảng viết điện tử và đường truyền cáp quang dự phòng; tạm khóa xếp lịch để bảo trì định kỳ.',
      status: 'MAINTENANCE',
    },
  ],
  knowledgeAndQuestionBank: [
    {
      itemCode: 'W03-KNW-01',
      domain: 'KNOWLEDGE_LIBRARY',
      uc: 'UCV2-31',
      slug: 'chien-luoc-xu-ly-cau-hoi-ngu-phap-dong-tu-va-lien-tu-toeic-part-5',
      title: 'Chiến lược xử lý câu hỏi từ loại, thì động từ và liên từ phụ thuộc trong TOEIC Part 5',
      summary:
        'Tài liệu hướng dẫn nhận diện nhanh cấu trúc mệnh đề, phân biệt giới từ chỉ thời gian với liên từ phụ thuộc và bẫy hòa hợp chủ ngữ – vị ngữ trong văn cảnh doanh nghiệp.',
    },
    {
      itemCode: 'W03-QBK-01',
      domain: 'QUESTION_BANK',
      uc: 'UCV2-32, UCV2-33',
      skillTag: 'Reading Part 5 · Liên từ & Mệnh đề trạng ngữ',
      stem: 'All regional branch managers must submit their quarterly budget forecasts ------- the finance director convenes the annual review meeting on Friday.',
      options: ['before', 'during', 'despite', 'concerning'],
      correctAnswer: 'before',
      explanation:
        'Mệnh đề phía sau có chủ ngữ "the finance director" và động từ chia thì hiện tại đơn "convenes", do đó cần liên từ phụ thuộc "before" thay vì giới từ "during", "despite" hoặc "concerning".',
    },
  ],
  operationsAndDailyReports: [
    {
      itemCode: 'W03-OPS-01',
      domain: 'ADMIN_AUTHORITY',
      uc: 'UCV2-53',
      title: 'Quy trình phê duyệt độc lập (Maker-Checker) khi gán vai trò và cấp quyền theo phạm vi',
      summary:
        'Quản trị viên lập đề xuất thay đổi vai trò hoặc cấp quyền bổ sung có thời hạn (CLASS, COURSE, SUPPORT_TOPIC, TEACHER); một người duyệt độc lập xác nhận để kích hoạt hiệu lực và ghi nhận vào sổ nhật ký bất biến.',
    },
    {
      itemCode: 'W03-OPS-02',
      domain: 'ADMIN_SYSTEM_CONFIG_AUDIT',
      uc: 'UCV2-54, UCV2-55',
      title: 'Giám sát cấu hình dịch vụ đã che khóa bí mật (••••••••) và nhật ký kiểm toán hệ thống',
      summary:
        'Hiển thị trung thực trạng thái kết nối SMTP, SePay, múi giờ trung tâm và AI; che toàn bộ chuỗi mật khẩu/API token; ghi nhận đề xuất thay đổi cấu hình và hỗ trợ truy vấn nhật ký bất biến theo bộ lọc.',
    },
    {
      itemCode: 'W03-OPS-03',
      domain: 'DAILY_ROLE_REPORTS',
      uc: 'UCV2-56',
      title: 'Báo cáo hoạt động cuối ngày theo múi giờ trung tâm UTC+7 cho 7 vai trò và xuất CSV an toàn',
      summary:
        'Tổng hợp số liệu hoạt động trong ngày theo đúng phạm vi từng vai trò (HV, GV, TV, HVU, TN, TT, QT), hỗ trợ lọc nguồn dữ liệu và tải tệp CSV UTF-8 có cơ chế chống CSV formula injection.',
    },
  ],
};

function escapeCsv(val) {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function writeWave03DataInventory(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const rows = [
    ...WAVE03_ORIGINAL_DATA.supportTickets.map((item) => ({
      itemCode: item.itemCode,
      domain: item.domain,
      uc: item.uc,
      title: item.subject,
      summary: item.counselorReply,
      status: 'READY_FOR_DISPOSABLE_SEED_AND_DEMO',
    })),
    ...WAVE03_ORIGINAL_DATA.admissionsApplications.map((item) => ({
      itemCode: item.itemCode,
      domain: item.domain,
      uc: item.uc,
      title: `${item.classCode} — ${item.className}`,
      summary: `${item.learnerGoal} (Học phí niêm yết: ${item.publishedPriceVnd.toLocaleString('vi-VN')} VNĐ)`,
      status: 'READY_FOR_DISPOSABLE_SEED_AND_DEMO',
    })),
    ...WAVE03_ORIGINAL_DATA.financeRecords.map((item) => ({
      itemCode: item.itemCode,
      domain: item.domain,
      uc: item.uc,
      title: `${item.referenceCode} (${item.kind})`,
      summary: `${item.learnerNote} — ${item.cashierVerifyReason}`,
      status: 'READY_FOR_DISPOSABLE_SEED_AND_DEMO',
    })),
    ...WAVE03_ORIGINAL_DATA.academicCurriculumAndRooms.map((item) => ({
      itemCode: item.itemCode,
      domain: item.domain,
      uc: item.uc,
      title: `${item.code} — ${item.title}`,
      summary: item.syllabusSummary || item.equipmentSummary,
      status: 'READY_FOR_DISPOSABLE_SEED_AND_DEMO',
    })),
    ...WAVE03_ORIGINAL_DATA.knowledgeAndQuestionBank.map((item) => ({
      itemCode: item.itemCode,
      domain: item.domain,
      uc: item.uc,
      title: item.title || item.skillTag,
      summary: item.summary || item.explanation,
      status: 'READY_FOR_DISPOSABLE_SEED_AND_DEMO',
    })),
    ...WAVE03_ORIGINAL_DATA.operationsAndDailyReports.map((item) => ({
      itemCode: item.itemCode,
      domain: item.domain,
      uc: item.uc,
      title: item.title,
      summary: item.summary,
      status: 'READY_FOR_DISPOSABLE_SEED_AND_DEMO',
    })),
  ];

  const csvHeader = ['item_code', 'domain', 'uc_codes', 'title', 'summary', 'status'];
  const csvLines = [
    csvHeader.join(','),
    ...rows.map((r) =>
      [r.itemCode, r.domain, r.uc, r.title, r.summary, r.status].map(escapeCsv).join(','),
    ),
  ];
  fs.writeFileSync(
    path.join(outDir, 'ORIGINAL_ADMISSIONS_FINANCE_OPERATIONS_INVENTORY.csv'),
    '\uFEFF' + csvLines.join('\r\n'),
    'utf8',
  );

  const md = `# DỮ LIỆU NGUYÊN GỐC TUYỂN SINH, TÀI CHÍNH, HỌC VỤ & VẬN HÀNH — WAVE 03

**Chiến dịch:** SMART ENGLISH V2 — ROAD99 WAVE 03/04  
**Ngày lập:** 09/11/2026  
**Cam kết chất lượng nội dung:** Toàn bộ dữ liệu tư vấn CSKH, hồ sơ nhập học, biên lai & điều chỉnh học phí, chương trình đào tạo TOEIC, danh mục phòng học, thư viện kiến thức và báo cáo vận hành được biên soạn nguyên gốc bằng tiếng Việt và tiếng Anh thương mại chuẩn mực. Tuyệt đối không chứa chuỗi \`synthetic\`, \`test\`, \`dummy\`, \`foo/bar\`, \`lorem ipsum\`, không để lộ UUID hoặc mã ticket kỹ thuật trên giao diện người dùng.

---

## 1. Danh mục Chủ đề & Phiếu Tư vấn CSKH (\`UCV2-09, 10, 11\`)

${WAVE03_ORIGINAL_DATA.supportTopics
  .map((t) => `- **\`${t.code}\` — ${t.name}:** ${t.description}`)
  .join('\n')}

| Mã mục | UC | Chủ đề yêu cầu | Nội dung phản hồi chuẩn của Tư vấn viên (TV) | Ghi nhận đồng thuận (Consent) |
|---|---|---|---|---|
${WAVE03_ORIGINAL_DATA.supportTickets
  .map(
    (t) =>
      `| \`${t.itemCode}\` | \`${t.uc}\` | ${t.subject} | ${t.counselorReply} | ${t.consentSummary} |`,
  )
  .join('\n')}

---

## 2. Hồ sơ Tuyển sinh, Đề xuất Lớp & Phê duyệt Học vụ (\`UCV2-11, 12, 13\`)

| Mã mục | UC | Mã lớp & Tên lớp | Mục tiêu học viên | Đánh giá của TV & Quyết định độc lập của HVU | Học phí niêm yết |
|---|---|---|---|---|---|
${WAVE03_ORIGINAL_DATA.admissionsApplications
  .map(
    (a) =>
      `| \`${a.itemCode}\` | \`${a.uc}\` | **${a.classCode}** — ${a.className} | ${a.learnerGoal} | **TV:** ${a.counselorAssessment}<br/>**HVU:** ${a.academicDecisionReason} | ${a.publishedPriceVnd.toLocaleString('vi-VN')} VNĐ |`,
  )
  .join('\n')}

---

## 3. Nghĩa vụ Học phí, Phiếu thu, Đối soát SePay & Điều chỉnh Ngoại lệ (\`UCV2-14, 15, 16, 17\`)

| Mã mục | UC | Mã tham chiếu | Loại nghiệp vụ | Số tiền | Diễn giải & Xác nhận đối soát của Thu ngân (TN) |
|---|---|---|---|---|---|
${WAVE03_ORIGINAL_DATA.financeRecords
  .map(
    (f) =>
      `| \`${f.itemCode}\` | \`${f.uc}\` | \`${f.referenceCode}\` | \`${f.kind}\` | ${f.amountVnd.toLocaleString('vi-VN')} VNĐ | **HV:** ${f.learnerNote}<br/>**TN:** ${f.cashierVerifyReason} |`,
  )
  .join('\n')}

---

## 4. Chương trình Đào tạo TOEIC, Phòng học & Học liệu Bổ sung (\`UCV2-31, 32, 38, 40\`)

| Mã mục | UC | Mã / Định danh | Tên hạng mục | Tóm tắt nội dung chuẩn hóa |
|---|---|---|---|---|
${[
  ...WAVE03_ORIGINAL_DATA.academicCurriculumAndRooms.map(
    (c) =>
      `| \`${c.itemCode}\` | \`${c.uc}\` | \`${c.code}\` | ${c.title} | ${c.syllabusSummary || c.equipmentSummary} |`,
  ),
  ...WAVE03_ORIGINAL_DATA.knowledgeAndQuestionBank.map(
    (k) =>
      `| \`${k.itemCode}\` | \`${k.uc}\` | \`${k.slug || k.skillTag}\` | ${k.title || k.stem} | ${k.summary || k.explanation} |`,
  ),
].join('\n')}

---

## 5. Quản trị Phân quyền, Cấu hình Dịch vụ & Báo cáo Cuối ngày (\`UCV2-53, 54, 55, 56\`)

| Mã mục | UC | Lĩnh vực | Tiêu đề nghiệp vụ | Mô tả kiểm soát & bảo mật |
|---|---|---|---|---|
${WAVE03_ORIGINAL_DATA.operationsAndDailyReports
  .map((o) => `| \`${o.itemCode}\` | \`${o.uc}\` | \`${o.domain}\` | ${o.title} | ${o.summary} |`)
  .join('\n')}
`;

  fs.writeFileSync(
    path.join(outDir, 'ORIGINAL_ADMISSIONS_FINANCE_OPERATIONS_DATA.md'),
    md,
    'utf8',
  );
  return { count: rows.length };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  const outDir = path.resolve(process.cwd(), 'docs/v2/v2-road-to-99-argon-wave03');
  const res = writeWave03DataInventory(outDir);
  console.log(`Generated Wave 03 original data inventory (${res.count} items) in ${outDir}`);
}
