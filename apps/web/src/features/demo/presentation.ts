// Editorial view of the verified local demonstration environment only.
// IDs, codes, email addresses, enums, amounts, scores and audit payloads stay raw.
let confirmed = false;
export function confirmDemoEnvironment() { confirmed = true; }
export function isDemoEnvironment() { return confirmed; }

const copy: Record<string, string> = {
  'Wave01 DEV STUDENT 10': 'Nguyễn Minh An',
  'Synthetic DEV author': 'Tổ chuyên môn TOEIC · Smart English',
  'Wave01 DEV INSTRUCTOR 11': 'Nguyễn Minh Anh',
  'Wave01 DEV CASHIER 4': 'Lê Thu Ngân',
  'Wave01 DEV TEACHING_INSPECTOR 5': 'Phạm Thanh Bình',
  'Wave01 DEV SYSTEM_ADMIN 8': 'Trần Gia Bảo',
  'Wave01 DEV SYSTEM_ADMIN 6': 'Nguyễn Hải Đăng',
  'Wave01 DEV SYSTEM_ADMIN 9': 'Lê Phương Thảo',
  'Wave01 DEV ADMIN_COORDINATOR 7': 'Điều phối viên trung tâm',
  'W02B HVU chưa có grant duyệt': 'Đỗ Ngọc Mai',
  'W02 synthetic contender 0': 'Trần Khánh Vy',
  'W02 synthetic contender 1': 'Đặng Minh Quân',
  'W02 synthetic contender 2': 'Lê Bảo Ngọc',
  'SYNTHETIC DEMO — SMTP recovery test': 'Tài khoản trải nghiệm khôi phục truy cập',
  'ThS. Nguyễn Thu Hà (Giảng viên Chấm thi & Học thuật)': 'Nguyễn Thu Hà',
  'ThS. Trần Quốc Tuấn (Quản lý Học vụ)': 'Trần Quốc Tuấn',
  'TS. Lê Minh Hạnh (Hội đồng Duyệt Học vụ Độc lập)': 'Lê Minh Hạnh',
  'Võ Hoàng Yến (Chuyên viên Tư vấn Tuyển sinh)': 'Võ Hoàng Yến',
  'Wave01 Synthetic English': 'TOEIC nền tảng — Nghe & Đọc',
  'TOEIC Reading Strategies & Grammar 550+ — Ngữ pháp & Đọc hiểu Chuyên sâu': 'TOEIC 550+ — Đọc hiểu và ngữ pháp',
  'TOEIC Listening Focus & Reflex 550+ — Phản xạ Nghe hiểu Công sở': 'TOEIC 550+ — Phản xạ nghe công sở',
  'TOEIC L&R Advancing 550+ — Toàn diện Nghe Đọc Trung cấp': 'TOEIC 550+ — Phát triển nghe và đọc',
  'TOEIC Intensive 750+ — Luyện Đề & Đọc Hiểu Đa Văn Bản': 'TOEIC 750+ — Đọc chuyên sâu và luyện đề',
  'TOEIC 4 Kỹ Năng Toàn Diện 650+ — Nghe Đọc & Giao Tiếp Viết Email': 'TOEIC 650+ — Lộ trình bốn kỹ năng',
  'TOEIC Speaking & Writing Workplace 150+ — Phản xạ Nói & Viết Email': 'TOEIC Speaking & Writing 150+ — Giao tiếp công việc',
  'Synthetic DEV only': 'Củng cố từ vựng, ngữ pháp và kỹ năng nghe đọc qua những tình huống học tập hằng ngày. Phù hợp người học đang xây dựng nền tảng A2.',
  'Foreign synthetic class': 'TOEIC nền tảng — Lớp 01',
  'Foreign lesson': 'Bài học mở đầu',
  'Foreign module': 'Học phần nền tảng',
  'One seat concurrency fixture': 'Lớp nền tảng — Nhóm nhỏ',
  'Private draft class': 'Lớp nền tảng — Dự kiến mở',
  'Other assigned DEV class': 'TOEIC nền tảng — Lớp bổ trợ',
  'Synthetic W03 class 1': 'Lớp thực hành tiếng Anh 01',
  'Original synthetic draft. Teacher must review before scheduling; no official Placement material.': 'Bản soạn phục vụ luyện tập trong lớp; giảng viên xem lại nội dung trước khi lên lịch.',
  'SYNTHETIC DEMO — English mentor': 'Nguyễn Minh Anh',
  'Synthetic profile for local demonstration only. No verified qualifications or real-world expertise are asserted.': 'Cùng bạn xác định thói quen học phù hợp, chọn nội dung cần ưu tiên và xây dựng kế hoạch ôn luyện từng tuần. Buổi tư vấn tập trung vào mục tiêu, thời gian tự học và những vướng mắc khi luyện tiếng Anh.',
  'Synthetic English practice': 'Lộ trình nền tảng · Phương pháp tự học · Luyện nghe và đọc',
  'Synthetic demo study support': 'Hỗ trợ học tập và sử dụng lớp học',
  'SYNTHETIC DEMO: discuss an English study plan; no real meeting or attendance asserted.': 'Trao đổi mục tiêu học tiếng Anh và kế hoạch luyện tập trong tuần.',
  'Synthetic demo only': 'Học theo ví dụ, thực hành từng bước và tự kiểm tra trước khi chuyển sang bài tiếp theo.',
  'Original project-authored content; offline Windows TTS. Internal practice only, not official Placement or TOEIC.': 'Bài luyện tập nguyên bản theo chủ đề thư viện, gồm đọc hiểu và nghe thông tin. Audio sử dụng giọng đọc máy để luyện tập; kết quả không phải điểm thi TOEIC chính thức.',
  'Original synthetic internal exercise; teacher must review.': 'Đọc kỹ yêu cầu, trả lời đầy đủ và kiểm tra lại trước khi nộp. Giảng viên sẽ xem bài theo tiêu chí hướng dẫn.',
  'Original demo content for the disposable environment. No official TOEIC claim.': 'Từ những thói quen quen thuộc đến kế hoạch học tập: luyện đọc, nghe, nói và viết bằng các tình huống gần gũi.',
  'Original synthetic learning path. Read, practise, then use the linked class assignments/tests.': 'Đọc ví dụ, hoàn thành phần luyện tập rồi vận dụng vào bài tập và bài kiểm tra trong lớp.',
  'Synthetic practice. PO can submit original text; a teacher reviews it.': 'Viết câu trả lời của bạn và gửi bài để nhận phản hồi từ giảng viên.',
  'Download the original project-authored practice notes. No official TOEIC content.': 'Tải phiếu học tập với từ vựng, mẫu câu và câu hỏi tự luyện về chủ đề thư viện.',
  'Original synthetic responses, including offline TTS. Not official Placement; no human proficiency or FINAL score asserted.': 'Thực hành đọc thành tiếng và viết hai câu về thói quen học. Giảng viên nhận xét theo rubric và xác nhận kết quả sau khi xem bài.',
  'Provisional review of whether the synthetic response addresses the prompt.': 'Câu trả lời bám sát yêu cầu, đủ ý và có thông tin phù hợp với đề bài.',
  'Provisional review of understandable basic English. Synthetic TTS is not evidence of a human speaking ability.': 'Diễn đạt dễ hiểu, dùng từ và cấu trúc câu cơ bản phù hợp. Bản thu giọng máy chỉ minh họa thao tác, không phản ánh năng lực nói của người thật.',
  'Task completion': 'Hoàn thành yêu cầu',
  '[SYNTHETIC DEMO] Draft reviewed in the usable grading screen. Human teacher must review criteria and decide FINAL.': 'Bài làm đã được lưu ở bản nháp. Giảng viên cần xem từng tiêu chí trước khi xác nhận điểm cuối.',
  '[SYNTHETIC DRAFT] Response received. Human teacher must review and choose FINAL. TTS must not be interpreted as human fluency.': 'Đã nhận bài làm, đang chờ giảng viên xem và xác nhận điểm cuối. Bản thu giọng máy chỉ minh họa thao tác, không phản ánh năng lực nói của người thật.',
  'Awaiting human instructor review; provisional draft only, not a published score.': 'Đang chờ giảng viên xem xét. Đây là bản nháp, chưa phải điểm đã công bố.',
  'Language clarity': 'Diễn đạt rõ ý',
  '[SYNTHETIC TTS DEMO] Read aloud the library story about Anna visiting on Saturday and borrowing two English books. This recording is generated offline and does not demonstrate human speaking ability.': 'Read aloud the story about Anna visiting the library on Saturday and borrowing two English books. Bản thu mẫu sử dụng giọng đọc máy để minh họa chức năng nghe bài nộp.',
  '[SYNTHETIC DEMO] Speaking and Writing formative practice': 'Rubric nói và viết cơ bản',
  '[SYNTHETIC DEMO] Speaking and Writing - teacher review': 'Luyện nói và viết — Giảng viên nhận xét',
  '[SYNTHETIC DEMO] Library visit - Reading and Listening': 'Luyện nghe và đọc — Một buổi ở thư viện',
  '[SYNTHETIC DEMO BR136] Everyday English — draft review': 'Tiếng Anh hằng ngày — Bản soạn đang hoàn thiện',
  '[SYNTHETIC DEMO BR136] Everyday English': 'Chủ đề 01 · Tiếng Anh trong cuộc sống hằng ngày',
  '[SYNTHETIC DEMO] Daily routines': '01 · Nói về thói quen hằng ngày',
  '[SYNTHETIC DEMO] Short introduction — awaiting teacher review': 'Bài tập 01 · Giới thiệu thói quen học tập',
  '[SYNTHETIC DEMO] Your own practice — ready for PO': 'Bài tập 02 · Viết kế hoạch luyện tiếng Anh',
  '[SYNTHETIC DEMO] Library practice handout': 'Phiếu học tập · Từ vựng và mẫu câu về thư viện',
  '[SYNTHETIC DEMO] 02 - Ask about a library visit': '02 · Hỏi và đáp khi đến thư viện',
  '[SYNTHETIC DEMO] 03 - Write a short study plan': '03 · Viết kế hoạch học tập ngắn',
  'Write two or three original sentences about your study routine. This separate demo task is initially unsubmitted and ungraded. No official certificate or TOEIC score is issued.':
    'Viết 2–3 câu tiếng Anh về thói quen tự học hằng ngày của bạn và nộp để giảng viên xem và góp ý trực tiếp.',
};
export function demoText(text: string): string {
  if (!confirmed) return text;
  if(/^Synthetic (LISTENING|READING|SPEAKING|WRITING) practice$/.test(text))return {LISTENING:'Luyện nghe',READING:'Luyện đọc',SPEAKING:'Luyện nói',WRITING:'Luyện viết'}[text.split(' ')[1] as 'LISTENING'];
  return copy[text] ?? text.replace(/^\[(?:SYNTHETIC (?:DEMO|DRAFT)|SYNTHETIC DEMO BR136)\]\s*/i, '');
}
export function classCodeLabel(code: string): string {
  if (!confirmed || !/^W0[123][A-Z]?-/.test(code)) return code;
  if (code.startsWith('W01-')) return code.endsWith('-1') ? 'SE-FOUNDATION-01B' : 'SE-FOUNDATION-01';
  if (code.startsWith('W02-OPEN-')) return 'SE-PRACTICE-OPEN';
  if (code.startsWith('W02-OTHER-')) return 'SE-FOUNDATION-02';
  if (code.startsWith('W02-FREE-')) return 'SE-NHOM-NHO';
  if (code.startsWith('W02-FOREIGN-')) return 'SE-DU-KIEN';
  return 'SE-PRACTICE-' + (code.match(/^W03-(\d+)/)?.[1]?.padStart(2, '0') ?? '01');
}
const displayFields = new Set(['fullName','displayName','name','title','description','introduction','bio','specialties','content','textResponse','body','label','topic','instructions','altText','feedback','attribution']);
const untouched = new Set(['audit','snapshot','provenance','payload','evidence','reason','token','email','code','metadata']);
export function presentDemoResponse<T>(input: T): T {
  const walk = (value: unknown, key = ''): unknown => {
    if (untouched.has(key)) return value;
    if (typeof value === 'string') return displayFields.has(key) ? demoText(value) : value;
    if (Array.isArray(value)) return value.map(v => walk(v));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,walk(v,k)]));
    return value;
  };
  return walk(input) as T;
}
