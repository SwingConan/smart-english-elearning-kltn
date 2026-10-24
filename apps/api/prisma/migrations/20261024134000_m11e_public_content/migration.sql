CREATE TYPE "PublicContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TABLE "public_content" (
  "id" UUID NOT NULL, "slug" TEXT NOT NULL, "category" TEXT NOT NULL, "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL, "bodyMarkdown" TEXT NOT NULL, "coverKey" TEXT, "coverImageUrl" TEXT,
  "featured" BOOLEAN NOT NULL DEFAULT false, "status" "PublicContentStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3), "createdById" UUID NOT NULL, "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "public_content_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "public_content_slug_key" ON "public_content"("slug");
CREATE INDEX "public_content_status_publishedAt_idx" ON "public_content"("status", "publishedAt");
CREATE INDEX "public_content_category_idx" ON "public_content"("category");
CREATE INDEX "public_content_featured_status_idx" ON "public_content"("featured", "status");
CREATE INDEX "public_content_createdById_idx" ON "public_content"("createdById");
CREATE INDEX "public_content_updatedById_idx" ON "public_content"("updatedById");
ALTER TABLE "public_content" ADD CONSTRAINT "public_content_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_content" ADD CONSTRAINT "public_content_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the editorial news/events collection that existed in the web bundle before M11.
-- The first coordinator is used only as the migration actor; no account or success state is fabricated.
INSERT INTO "public_content" (
  "id", "slug", "category", "title", "excerpt", "bodyMarkdown", "coverKey",
  "featured", "status", "publishedAt", "createdById", "updatedById", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), content.slug, content.category, content.title, content.excerpt,
       content.body, content.cover, content.featured, 'PUBLISHED'::"PublicContentStatus",
       content.published_at, actor.id, actor.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('lich-khai-giang-toeic-thang-10-2026','Lịch khai giảng','Lịch khai giảng TOEIC tháng 10/2026: chọn lớp theo lịch và mục tiêu học','Cách đọc thông tin lớp mở, so sánh lịch học và xác định lựa chọn phù hợp trước khi gửi đăng ký.','# Bắt đầu từ mục tiêu\n\nXác định kỹ năng ưu tiên, thời gian học và hình thức phù hợp trước khi chọn lớp.\n\n- Hoàn thành Placement nội bộ.\n- So sánh lịch, học phí và tình trạng lớp.\n- Theo dõi trạng thái đăng ký và thanh toán.','enrollment',true,'2026-09-28'::timestamp),
  ('workshop-listening-nghe-y-chinh','Workshop','Workshop Listening: nghe ý chính và hành động tiếp theo trong hội thoại công sở','Một quy trình nghe có mục tiêu để nhận diện tình huống, ý định của người nói và bước tiếp theo.','# Nghe để hiểu tình huống\n\nXác định ai đang nói, bối cảnh và mục đích trước khi tập trung vào đáp án.','listening',false,'2026-09-24'::timestamp),
  ('toeic-reading-doc-dung-toc-do','Kỹ năng TOEIC','TOEIC Reading: đừng đọc mọi câu với cùng một tốc độ','Phân bổ nhịp đọc theo mục đích câu hỏi để dành sự tập trung cho phần cần suy luận.','# Tốc độ đọc phụ thuộc nhiệm vụ\n\nPhân loại câu hỏi thành thông tin trực tiếp, diễn đạt tương đương và suy luận.','reading',false,'2026-09-22'::timestamp),
  ('luyen-speaking-toeic-to-chuc-cau-tra-loi','Kỹ năng TOEIC','Luyện Speaking TOEIC: tổ chức câu trả lời trước khi cố nói thật dài','Một câu trả lời có cấu trúc, lý do và ví dụ phù hợp thường rõ ràng hơn.','# Khung ba phần\n\n1. Trả lời trực tiếp.\n2. Đưa ra lý do.\n3. Thêm ví dụ ngắn.','speaking',false,'2026-09-20'::timestamp),
  ('writing-toeic-tu-cau-dung-den-doan-viet-co-muc-dich','Kỹ năng TOEIC','Writing TOEIC: từ câu đúng đến đoạn viết có mục đích','Kiểm tra mục đích giao tiếp, mức độ đầy đủ và liên kết ý trước lỗi ngữ pháp.','# Viết có mục đích\n\nKiểm tra mục đích chính, yêu cầu đề bài, liên kết ý rồi mới rà soát ngữ pháp.','writing',false,'2026-09-18'::timestamp),
  ('kiem-tra-dau-vao-hieu-qua','Hướng dẫn học','Kiểm tra đầu vào hiệu quả: để kết quả phản ánh đúng khả năng hiện tại','Chuẩn bị thiết bị, không gian và tâm thế phù hợp cho lần đánh giá đầu vào.','# Chuẩn bị ổn định\n\nChọn nơi yên tĩnh, kiểm tra tai nghe, tự làm bài và đọc kỹ hướng dẫn.','placement',false,'2026-09-16'::timestamp),
  ('giu-nhip-hoc-tren-lop-va-online','Hướng dẫn học','5 cách giữ nhịp học khi vừa học trên lớp vừa tự học online','Biến lịch học kết hợp thành những phiên ngắn, có mục tiêu và đủ linh hoạt.','# Nhịp học có thể lặp lại\n\nĐặt khung tự học cố định, chọn một mục tiêu mỗi phiên và xem lại tiến độ cuối tuần.','study-rhythm',false,'2026-09-14'::timestamp),
  ('cach-doc-ket-qua-hoc-tap','Cập nhật chương trình','Cách đọc kết quả học tập theo từng lần đánh giá','Đọc kết quả theo kỹ năng, trạng thái dữ liệu và bối cảnh trước khi kết luận xu hướng.','# Một con số không kể hết câu chuyện\n\nPhân biệt dữ liệu đã đủ, đang chờ chấm và còn thiếu; không biến trạng thái thiếu thành điểm 0.','results',false,'2026-09-12'::timestamp)
) AS content(slug,category,title,excerpt,body,cover,featured,published_at)
CROSS JOIN LATERAL (
  SELECT id FROM "users" WHERE role = 'ADMIN_COORDINATOR'::"UserRole" ORDER BY "createdAt" ASC LIMIT 1
) actor
ON CONFLICT ("slug") DO NOTHING;
