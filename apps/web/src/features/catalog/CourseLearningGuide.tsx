import type { PublicCourse } from './types';

export function CourseLearningGuide({course}:{course:PublicCourse}) {
  const scope=course.skillScope;
  const goals=scope==='FOUR_SKILLS'?['Kết nối nghe và đọc với nội dung nói, viết theo tình huống.','Tổ chức câu trả lời rõ ý và tự kiểm tra theo tiêu chí hướng dẫn.','Xây dựng nhịp luyện tập cân bằng giữa bốn kỹ năng.']:scope==='SPEAKING'||scope==='WRITING'?['Sắp xếp ý trước khi nói hoặc viết để câu trả lời mạch lạc.','Vận dụng từ vựng và mẫu câu trong trao đổi, học tập và công việc.','Cải thiện bài làm dựa trên phản hồi cụ thể của giảng viên.']:['Xác định ý chính, thông tin chi tiết và từ khóa trong bài nghe, bài đọc.','Củng cố từ vựng theo chủ đề và những cấu trúc ngữ pháp thường gặp.','Giải thích lựa chọn của mình, nhận diện lỗi sai và luyện lại có mục tiêu.'];
  return <section className="mt-7 space-y-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-6">
    <div><h3 className="text-lg font-bold text-slate-950">Bạn sẽ rèn luyện điều gì?</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">{goals.map(g=><li key={g} className="flex gap-2"><span aria-hidden="true" className="text-indigo-600">✓</span>{g}</li>)}</ul></div>
    <div><h3 className="font-bold text-slate-950">Chuẩn bị trước khi học</h3><p className="mt-2 text-sm leading-6 text-slate-600">{course.level==='A2'?'Làm quen với câu đơn và từ vựng đời sống. Dành một khoảng thời gian tự học đều đặn để ôn lại sau mỗi bài.':course.level==='B2'?'Củng cố kỹ năng đọc, nghe các nội dung có độ dài vừa phải và chuẩn bị cách ghi chú, tra cứu từ mới chủ động.':'Ôn lại ngữ pháp cơ bản, luyện đọc đoạn ngắn và nghe các câu hội thoại quen thuộc trước khi bước vào từng chủ đề.'} Trao đổi với tư vấn viên nếu bạn cần chọn lộ trình phù hợp.</p></div>
    <div><h3 className="font-bold text-slate-950">Gợi ý nhịp học</h3><ol className="mt-3 grid gap-3 sm:grid-cols-2">{['Ôn kiến thức trọng tâm','Thực hành theo chủ đề','Nhận phản hồi và sửa lỗi','Tổng hợp và luyện lại'].map((s,i)=><li key={s} className="rounded-xl bg-white p-3 text-sm text-slate-700"><span className="mr-2 font-bold text-indigo-600">0{i+1}</span>{s}</li>)}</ol></div>
  </section>;
}
