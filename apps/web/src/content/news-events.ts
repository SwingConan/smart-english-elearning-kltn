export type NewsEventType = 'KHAI_GIANG' | 'WORKSHOP' | 'HUONG_DAN' | 'CHUONG_TRINH';

export interface NewsEventItem {
  slug: string;
  type: NewsEventType;
  category: string;
  title: string;
  excerpt: string;
  body: string[];
  publishedAt: string;
  coverKey: 'indigo' | 'sky' | 'amber' | 'emerald';
}

export const newsEvents: NewsEventItem[] = [
  {
    slug: 'lich-khai-giang-toeic-thang-10-2026',
    type: 'KHAI_GIANG',
    category: 'Lịch khai giảng',
    coverKey: 'indigo',
    publishedAt: '2026-09-28',
    title: 'Lịch khai giảng các lớp TOEIC tháng 10/2026',
    excerpt:
      'Tổng hợp các lớp Listening & Reading theo khung giờ tối và cuối tuần, gồm cả lựa chọn online và hybrid.',
    body: [
      'Các lớp tháng 10 được tổ chức theo hai khung giờ chính: tối thứ Ba, thứ Năm và sáng cuối tuần. Mỗi lớp có trang chi tiết riêng để người học so sánh lịch, hình thức, sĩ số và học phí.',
      'Người học có thể đăng ký trực tiếp lớp miễn phí sau khi đăng nhập. Với lớp có học phí, hệ thống ghi nhận trạng thái chờ thanh toán và chưa mở nội dung học.',
    ],
  },
  {
    slug: 'workshop-listening-nghe-y-chinh',
    type: 'WORKSHOP',
    category: 'Workshop',
    coverKey: 'sky',
    publishedAt: '2026-09-24',
    title: 'Workshop Listening: nghe ý chính trong hội thoại công sở',
    excerpt:
      'Buổi hướng dẫn cách nhận diện mục đích, người nói và hành động tiếp theo trong đoạn hội thoại ngắn.',
    body: [
      'Workshop tập trung vào quy trình nghe có mục tiêu: đọc nhanh câu hỏi, nhận diện từ khóa và ghi lại thay đổi về thời gian, địa điểm hoặc người phụ trách.',
      'Nội dung phù hợp với người học đang củng cố nền tảng Listening và muốn hình thành thói quen tự kiểm tra sau mỗi bài luyện.',
    ],
  },
  {
    slug: 'huong-dan-chuan-bi-lo-trinh-toeic',
    type: 'HUONG_DAN',
    category: 'Hướng dẫn học',
    coverKey: 'amber',
    publishedAt: '2026-09-18',
    title: 'Chuẩn bị lộ trình TOEIC: bắt đầu từ mục tiêu và thời gian học',
    excerpt:
      'Một danh sách gợi ý ngắn giúp xác định mục tiêu, lịch học phù hợp và cách theo dõi tiến độ.',
    body: [
      'Hãy bắt đầu bằng mục tiêu sử dụng tiếng Anh và quỹ thời gian học mỗi tuần. Sau đó, chọn khóa học phù hợp về kỹ năng và trình độ trước khi so sánh các lớp đang mở.',
      'Tính năng kiểm tra đầu vào đang được chuẩn bị. Người học vẫn có thể chủ động xem chương trình và đăng ký các lớp đang mở.',
    ],
  },
  {
    slug: 'cap-nhat-chuong-trinh-toeic-lms',
    type: 'CHUONG_TRINH',
    category: 'Cập nhật chương trình',
    coverKey: 'emerald',
    publishedAt: '2026-09-12',
    title: 'Cập nhật trải nghiệm học TOEIC theo lớp',
    excerpt:
      'Giao diện mới kết nối tổng quan lớp, bài học, tài liệu, bài kiểm tra, kết quả và tiến độ.',
    body: [
      'Mỗi lớp đang học có một không gian thống nhất. Thanh điều hướng lớp giúp người học luôn biết mình đang ở đâu và bước tiếp theo là gì.',
      'Trang tiến độ tổng hợp số bài học đã hoàn thành cùng trạng thái các bài kiểm tra trong lớp.',
    ],
  },
];

export function findNewsEvent(slug: string): NewsEventItem | undefined {
  return newsEvents.find((item) => item.slug === slug);
}
