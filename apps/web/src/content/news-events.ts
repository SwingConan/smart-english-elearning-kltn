export const newsCategories = [
  'Tất cả',
  'Lịch khai giảng',
  'Workshop',
  'Kỹ năng TOEIC',
  'Hướng dẫn học',
  'Cập nhật chương trình',
] as const;

export type NewsCategory = Exclude<(typeof newsCategories)[number], 'Tất cả'>;
export type NewsCoverKey =
  | 'enrollment'
  | 'listening'
  | 'reading'
  | 'speaking'
  | 'writing'
  | 'placement'
  | 'study-rhythm'
  | 'results';

export interface NewsSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  steps?: string[];
}

export interface NewsEventItem {
  slug: string;
  category: NewsCategory;
  title: string;
  excerpt: string;
  publishedAt: string;
  readMinutes: number;
  coverKey: NewsCoverKey;
  featured?: boolean;
  sections: NewsSection[];
}

export const newsEvents: NewsEventItem[] = [
  {
    slug: 'lich-khai-giang-toeic-thang-10-2026',
    category: 'Lịch khai giảng',
    coverKey: 'enrollment',
    publishedAt: '2026-09-28',
    readMinutes: 4,
    featured: true,
    title: 'Lịch khai giảng TOEIC tháng 10/2026: chọn lớp theo lịch và mục tiêu học',
    excerpt:
      'Cách đọc thông tin lớp mở, so sánh lịch học và xác định lựa chọn phù hợp trước khi gửi đăng ký.',
    sections: [
      {
        heading: 'Bắt đầu từ mục tiêu, không bắt đầu từ tên lớp',
        paragraphs: [
          'Trước khi xem lịch, hãy xác định kỹ năng cần ưu tiên, khoảng thời gian có thể học đều mỗi tuần và hình thức học phù hợp. Ba thông tin này giúp thu hẹp lựa chọn thực tế hơn việc chỉ nhìn vào tên khóa học.',
          'Danh mục khóa học mô tả phạm vi nội dung. Trang chi tiết lớp mới là nơi thể hiện lịch, hình thức, học phí và tình trạng nhận đăng ký tại thời điểm bạn xem.',
        ],
      },
      {
        heading: 'Checklist trước khi chọn lớp',
        bullets: [
          'Đối chiếu ngày bắt đầu và toàn bộ khung giờ học.',
          'Kiểm tra hình thức online, offline hoặc hybrid trên trang chi tiết lớp.',
          'Đọc phạm vi kỹ năng và yêu cầu đầu vào của khóa học.',
          'Đăng nhập trước khi thực hiện bước đăng ký lớp.',
        ],
      },
      {
        heading: 'Sau khi đăng ký',
        paragraphs: [
          'Lớp miễn phí có thể được ghi nhận đăng ký ngay theo trạng thái hệ thống. Với lớp có học phí, đăng ký có thể ở trạng thái chờ thanh toán; nội dung học chỉ mở khi điều kiện truy cập đã được đáp ứng.',
        ],
      },
    ],
  },
  {
    slug: 'workshop-listening-nghe-y-chinh',
    category: 'Workshop',
    coverKey: 'listening',
    publishedAt: '2026-09-24',
    readMinutes: 5,
    title: 'Workshop Listening: nghe ý chính và hành động tiếp theo trong hội thoại công sở',
    excerpt:
      'Một quy trình nghe có mục tiêu để nhận diện tình huống, ý định của người nói và bước tiếp theo trong hội thoại.',
    sections: [
      {
        heading: 'Nghe để hiểu tình huống trước',
        paragraphs: [
          'Trong hội thoại công sở, một chi tiết riêng lẻ chỉ có ý nghĩa khi đặt đúng bối cảnh. Người học nên xác định nhanh ai đang nói, họ đang ở đâu và lý do của cuộc trao đổi trước khi tập trung vào đáp án.',
        ],
      },
      {
        heading: 'Ba lượt xử lý một đoạn nghe',
        steps: [
          'Lượt đầu: nắm mục đích chung và mối quan hệ giữa người nói.',
          'Lượt hai: ghi lại thay đổi về thời gian, địa điểm hoặc người phụ trách.',
          'Lượt ba: đối chiếu câu hỏi, giải thích vì sao phương án đã chọn phù hợp.',
        ],
      },
      {
        heading: 'Mang kỹ thuật vào buổi tự học',
        paragraphs: [
          'Sau workshop, hãy luyện trên đoạn ngắn và giữ cùng một biểu mẫu ghi chú. Mục tiêu là hình thành quy trình ổn định, không phải nghe lặp lại không giới hạn cho đến khi thuộc nội dung.',
        ],
      },
    ],
  },
  {
    slug: 'toeic-reading-doc-dung-toc-do',
    category: 'Kỹ năng TOEIC',
    coverKey: 'reading',
    publishedAt: '2026-09-22',
    readMinutes: 6,
    title: 'TOEIC Reading: đừng đọc mọi câu với cùng một tốc độ',
    excerpt:
      'Phân bổ nhịp đọc theo mục đích câu hỏi để dành sự tập trung cho những phần thật sự cần suy luận.',
    sections: [
      {
        heading: 'Tốc độ đọc phụ thuộc vào nhiệm vụ',
        paragraphs: [
          'Đọc tiêu đề, tìm tên riêng và kiểm tra một chi tiết không cần cùng mức độ tập trung như suy luận mục đích hoặc liên kết hai văn bản. Dùng một tốc độ cho mọi câu dễ khiến bạn tiêu tốn thời gian ở phần đơn giản.',
        ],
      },
      {
        heading: 'Chia câu hỏi thành ba nhóm',
        bullets: [
          'Thông tin hiển thị trực tiếp: quét để tìm từ khóa và vùng chứa dữ kiện.',
          'Diễn đạt tương đương: so sánh ý nghĩa thay vì chờ một cụm từ giống hệt.',
          'Suy luận và liên kết: đọc thêm câu trước, câu sau hoặc văn bản liên quan.',
        ],
      },
      {
        heading: 'Tự kiểm tra sau bài luyện',
        paragraphs: [
          'Đừng chỉ ghi câu đúng hay sai. Hãy đánh dấu câu nào mất nhiều thời gian, nguyên nhân nằm ở từ vựng, cấu trúc hay chiến lược tìm thông tin. Nhật ký ngắn này giúp buổi luyện sau có mục tiêu rõ hơn.',
        ],
      },
    ],
  },
  {
    slug: 'luyen-speaking-toeic-to-chuc-cau-tra-loi',
    category: 'Kỹ năng TOEIC',
    coverKey: 'speaking',
    publishedAt: '2026-09-20',
    readMinutes: 5,
    title: 'Luyện Speaking TOEIC: tổ chức câu trả lời trước khi cố nói thật dài',
    excerpt:
      'Một câu trả lời có cấu trúc, lý do và ví dụ phù hợp thường rõ ràng hơn một câu trả lời dài nhưng thiếu trọng tâm.',
    sections: [
      {
        heading: 'Ưu tiên thông điệp chính',
        paragraphs: [
          'Trước khi nói, hãy dành vài giây xác định quan điểm hoặc thông tin cốt lõi. Khi thông điệp chính rõ, bạn dễ chọn từ vựng và ví dụ phục vụ đúng mục đích hơn.',
        ],
      },
      {
        heading: 'Khung ba phần dễ luyện',
        steps: [
          'Trả lời trực tiếp câu hỏi bằng một câu rõ ràng.',
          'Đưa ra một lý do hoặc chi tiết giải thích.',
          'Thêm ví dụ ngắn, rồi kết thúc thay vì kéo dài không cần thiết.',
        ],
      },
      {
        heading: 'Nghe lại có tiêu chí',
        paragraphs: [
          'Khi nghe bản ghi của mình, hãy kiểm tra lần lượt độ rõ của ý, sự liền mạch và khả năng nghe hiểu. Không nên cố sửa tất cả lỗi trong một lượt luyện.',
        ],
      },
    ],
  },
  {
    slug: 'writing-toeic-tu-cau-dung-den-doan-viet-co-muc-dich',
    category: 'Kỹ năng TOEIC',
    coverKey: 'writing',
    publishedAt: '2026-09-18',
    readMinutes: 6,
    title: 'Writing TOEIC: từ câu đúng đến đoạn viết có mục đích',
    excerpt:
      'Kiểm tra mục đích giao tiếp, mức độ đầy đủ và liên kết ý trước khi chỉ tập trung vào lỗi ngữ pháp.',
    sections: [
      {
        heading: 'Một câu đúng chưa chắc đã giải quyết nhiệm vụ',
        paragraphs: [
          'Trong email hoặc phản hồi công việc, người đọc cần biết bạn đang xác nhận, yêu cầu hay đề xuất điều gì. Vì vậy, bước đầu tiên là kiểm tra xem đoạn viết đã hoàn thành đủ yêu cầu giao tiếp hay chưa.',
        ],
      },
      {
        heading: 'Checklist rà soát theo thứ tự',
        bullets: [
          'Mục đích chính xuất hiện sớm và dễ nhận biết.',
          'Mỗi yêu cầu trong đề đều có thông tin phản hồi tương ứng.',
          'Các câu được nối theo một trình tự hợp lý.',
          'Ngữ pháp, từ vựng và dấu câu được kiểm tra ở lượt cuối.',
        ],
      },
      {
        heading: 'Lưu phiên bản để thấy cách mình sửa',
        paragraphs: [
          'Giữ bản nháp đầu và bản đã chỉnh giúp bạn nhận ra loại thay đổi nào thực sự làm thông điệp rõ hơn. Đây là dữ liệu hữu ích cho lần viết tiếp theo, không phải bằng chứng cho một mức điểm cố định.',
        ],
      },
    ],
  },
  {
    slug: 'kiem-tra-dau-vao-hieu-qua',
    category: 'Hướng dẫn học',
    coverKey: 'placement',
    publishedAt: '2026-09-16',
    readMinutes: 5,
    title:
      'Kiểm tra đầu vào hiệu quả: làm bài như thế nào để kết quả phản ánh đúng khả năng hiện tại?',
    excerpt:
      'Chuẩn bị thiết bị, không gian và tâm thế phù hợp để lần đánh giá đầu vào có giá trị tham khảo tốt hơn.',
    sections: [
      {
        heading: 'Chuẩn bị môi trường ổn định',
        paragraphs: [
          'Chọn nơi yên tĩnh, kiểm tra tai nghe và kết nối trước khi bắt đầu. Nếu bị gián đoạn, kết quả có thể phản ánh điều kiện làm bài nhiều hơn năng lực hiện tại.',
        ],
      },
      {
        heading: 'Trong khi làm bài',
        bullets: [
          'Tự làm bài và không tra cứu tài liệu ngoài.',
          'Đọc hướng dẫn của từng phần trước khi trả lời.',
          'Không dành quá nhiều thời gian cho một câu nếu bài có giới hạn thời gian.',
          'Chỉ nộp khi đã kiểm tra trạng thái các phần cần hoàn thành.',
        ],
      },
      {
        heading: 'Hiểu đúng vai trò của kết quả',
        paragraphs: [
          'Kết quả đầu vào là một nguồn tham khảo cho lựa chọn học tập. Khả năng tiếp cận bài kiểm tra, dữ liệu còn thiếu hoặc phần chưa được đánh giá cần được xem cùng bối cảnh trước khi đưa ra quyết định.',
        ],
      },
    ],
  },
  {
    slug: 'giu-nhip-hoc-tren-lop-va-online',
    category: 'Hướng dẫn học',
    coverKey: 'study-rhythm',
    publishedAt: '2026-09-14',
    readMinutes: 5,
    title: '5 cách giữ nhịp học khi bạn vừa học trên lớp vừa tự học online',
    excerpt:
      'Biến lịch học kết hợp thành những phiên ngắn, có mục tiêu và đủ linh hoạt để duy trì trong nhiều tuần.',
    sections: [
      {
        heading: 'Tạo một nhịp học có thể lặp lại',
        paragraphs: [
          'Lịch học tốt không nhất thiết dày. Điều quan trọng là bạn biết buổi nào để tiếp nhận kiến thức, buổi nào để luyện và khi nào cần xem lại phản hồi.',
        ],
      },
      {
        heading: 'Năm hành động thực tế',
        steps: [
          'Đặt hai hoặc ba khung tự học cố định mỗi tuần.',
          'Mỗi phiên chỉ chọn một kỹ năng hoặc một mục tiêu cụ thể.',
          'Mở lại ghi chú trên lớp trước khi bắt đầu bài luyện online.',
          'Ghi lại câu chưa hiểu để hỏi trong buổi học tiếp theo.',
          'Cuối tuần, xem tiến độ và điều chỉnh kế hoạch thay vì học bù dồn dập.',
        ],
      },
      {
        heading: 'Khi lịch bị gián đoạn',
        paragraphs: [
          'Hãy quay lại bằng một nhiệm vụ ngắn và rõ ràng. Việc khôi phục nhịp học quan trọng hơn cố hoàn thành ngay toàn bộ phần đã bỏ lỡ.',
        ],
      },
    ],
  },
  {
    slug: 'cach-doc-ket-qua-hoc-tap',
    category: 'Cập nhật chương trình',
    coverKey: 'results',
    publishedAt: '2026-09-12',
    readMinutes: 6,
    title: 'Đừng vội kết luận “tăng hay giảm”: cách đọc kết quả học tập theo từng lần đánh giá',
    excerpt:
      'Đọc kết quả theo kỹ năng, trạng thái dữ liệu và bối cảnh của từng lần đánh giá trước khi kết luận về xu hướng.',
    sections: [
      {
        heading: 'Một con số không kể hết câu chuyện',
        paragraphs: [
          'Hai lần đánh giá có thể khác nhau về nội dung, độ khó, điều kiện làm bài hoặc phần kỹ năng đã hoàn tất. Vì vậy, tổng điểm không nên được dùng riêng lẻ để giải thích toàn bộ tiến độ.',
        ],
      },
      {
        heading: 'Ba lớp thông tin cần đọc',
        bullets: [
          'Trạng thái: đã có đủ dữ liệu, đang chờ chấm hay còn thiếu phần đánh giá.',
          'Kỹ năng: thay đổi xuất hiện ở Listening, Reading, Speaking hay Writing.',
          'Bối cảnh: loại bài đánh giá và thời điểm thực hiện có tương đương hay không.',
        ],
      },
      {
        heading: 'Biến kết quả thành hành động học',
        paragraphs: [
          'Hãy chọn một hoặc hai tín hiệu có thể hành động, chẳng hạn kỹ năng cần luyện thêm hoặc loại câu hỏi thường mất thời gian. Khi dữ liệu đang chờ hoặc còn thiếu, giao diện cần thể hiện đúng trạng thái thay vì suy diễn thành xu hướng.',
        ],
      },
    ],
  },
];

export function findNewsEvent(slug: string): NewsEventItem | undefined {
  return newsEvents.find((item) => item.slug === slug);
}
