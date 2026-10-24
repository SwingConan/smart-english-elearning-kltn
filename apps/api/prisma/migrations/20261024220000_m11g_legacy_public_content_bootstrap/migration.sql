CREATE TYPE "PublicContentOrigin" AS ENUM ('LEGACY_IMPORT', 'ADMIN_AUTHORED');

ALTER TABLE "public_content"
  ALTER COLUMN "createdById" DROP NOT NULL,
  ALTER COLUMN "updatedById" DROP NOT NULL,
  ADD COLUMN "origin" "PublicContentOrigin" NOT NULL DEFAULT 'ADMIN_AUTHORED';

UPDATE "public_content"
SET "origin" = 'LEGACY_IMPORT'::"PublicContentOrigin"
WHERE "slug" IN (
  'lich-khai-giang-toeic-thang-10-2026', 'workshop-listening-nghe-y-chinh',
  'toeic-reading-doc-dung-toc-do', 'luyen-speaking-toeic-to-chuc-cau-tra-loi',
  'writing-toeic-tu-cau-dung-den-doan-viet-co-muc-dich', 'kiem-tra-dau-vao-hieu-qua',
  'giu-nhip-hoc-tren-lop-va-online', 'cach-doc-ket-qua-hoc-tap'
);

INSERT INTO "public_content" (
  "id", "slug", "category", "title", "excerpt", "bodyMarkdown", "coverKey",
  "featured", "status", "publishedAt", "origin", "createdAt", "updatedAt"
)
VALUES
(gen_random_uuid(), 'lich-khai-giang-toeic-thang-10-2026', 'Lịch khai giảng', 'Lịch khai giảng TOEIC tháng 10/2026: chọn lớp theo lịch và mục tiêu học', 'Cách đọc thông tin lớp mở, so sánh lịch học và xác định lựa chọn phù hợp trước khi gửi đăng ký.', $body$
## Bắt đầu từ mục tiêu, không bắt đầu từ tên lớp

Trước khi xem lịch, hãy xác định kỹ năng cần ưu tiên, khoảng thời gian có thể học đều mỗi tuần và hình thức học phù hợp. Ba thông tin này giúp thu hẹp lựa chọn thực tế hơn việc chỉ nhìn vào tên khóa học.

Danh mục khóa học mô tả phạm vi nội dung. Trang chi tiết lớp mới là nơi thể hiện lịch, hình thức, học phí và tình trạng nhận đăng ký tại thời điểm bạn xem.

## Từ khám phá đến đăng ký lớp

- Khám phá chương trình và xác định mục tiêu kỹ năng trước khi làm Placement.
- Hoàn thành Placement nội bộ trước Enrollment; kết quả này không phải điểm thi TOEIC chính thức.
- Đọc Evaluation theo kỹ năng và Course/Class Recommendation từ dữ liệu hiện có; dữ liệu thiếu hoặc đang chờ không được hiểu là 0.
- Dùng gợi ý làm căn cứ để so sánh lịch học, hình thức, học phí và tình trạng lớp.
- Sau khi chọn lớp phù hợp, đăng nhập và thực hiện bước Enrollment theo trạng thái hệ thống.

## Sau khi đăng ký

Lớp miễn phí có thể được ghi nhận đăng ký ngay theo trạng thái hệ thống. Với lớp có học phí, đăng ký có thể ở trạng thái chờ thanh toán; nội dung học chỉ mở khi điều kiện truy cập đã được đáp ứng.
$body$, 'enrollment', true, 'PUBLISHED', '2026-09-28'::timestamp, 'LEGACY_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'workshop-listening-nghe-y-chinh', 'Workshop', 'Workshop Listening: nghe ý chính và hành động tiếp theo trong hội thoại công sở', 'Một quy trình nghe có mục tiêu để nhận diện tình huống, ý định của người nói và bước tiếp theo trong hội thoại.', $body$
## Nghe để hiểu tình huống trước

Trong hội thoại công sở, một chi tiết riêng lẻ chỉ có ý nghĩa khi đặt đúng bối cảnh. Người học nên xác định nhanh ai đang nói, họ đang ở đâu và lý do của cuộc trao đổi trước khi tập trung vào đáp án.

## Ba lượt xử lý một đoạn nghe

1. Lượt đầu: nắm mục đích chung và mối quan hệ giữa người nói.
2. Lượt hai: ghi lại thay đổi về thời gian, địa điểm hoặc người phụ trách.
3. Lượt ba: đối chiếu câu hỏi, giải thích vì sao phương án đã chọn phù hợp.

## Mang kỹ thuật vào buổi tự học

Sau workshop, hãy luyện trên đoạn ngắn và giữ cùng một biểu mẫu ghi chú. Mục tiêu là hình thành quy trình ổn định, không phải nghe lặp lại không giới hạn cho đến khi thuộc nội dung.
$body$, 'listening', false, 'PUBLISHED', '2026-09-24'::timestamp, 'LEGACY_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'toeic-reading-doc-dung-toc-do', 'Kỹ năng TOEIC', 'TOEIC Reading: đừng đọc mọi câu với cùng một tốc độ', 'Phân bổ nhịp đọc theo mục đích câu hỏi để dành sự tập trung cho những phần thật sự cần suy luận.', $body$
## Tốc độ đọc phụ thuộc vào nhiệm vụ

Đọc tiêu đề, tìm tên riêng và kiểm tra một chi tiết không cần cùng mức độ tập trung như suy luận mục đích hoặc liên kết hai văn bản. Dùng một tốc độ cho mọi câu dễ khiến bạn tiêu tốn thời gian ở phần đơn giản.

## Chia câu hỏi thành ba nhóm

- Thông tin hiển thị trực tiếp: quét để tìm từ khóa và vùng chứa dữ kiện.
- Diễn đạt tương đương: so sánh ý nghĩa thay vì chờ một cụm từ giống hệt.
- Suy luận và liên kết: đọc thêm câu trước, câu sau hoặc văn bản liên quan.

## Tự kiểm tra sau bài luyện

Đừng chỉ ghi câu đúng hay sai. Hãy đánh dấu câu nào mất nhiều thời gian, nguyên nhân nằm ở từ vựng, cấu trúc hay chiến lược tìm thông tin. Nhật ký ngắn này giúp buổi luyện sau có mục tiêu rõ hơn.
$body$, 'reading', false, 'PUBLISHED', '2026-09-22'::timestamp, 'LEGACY_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'luyen-speaking-toeic-to-chuc-cau-tra-loi', 'Kỹ năng TOEIC', 'Luyện Speaking TOEIC: tổ chức câu trả lời trước khi cố nói thật dài', 'Một câu trả lời có cấu trúc, lý do và ví dụ phù hợp thường rõ ràng hơn một câu trả lời dài nhưng thiếu trọng tâm.', $body$
## Ưu tiên thông điệp chính

Trước khi nói, hãy dành vài giây xác định quan điểm hoặc thông tin cốt lõi. Khi thông điệp chính rõ, bạn dễ chọn từ vựng và ví dụ phục vụ đúng mục đích hơn.

## Khung ba phần dễ luyện

1. Trả lời trực tiếp câu hỏi bằng một câu rõ ràng.
2. Đưa ra một lý do hoặc chi tiết giải thích.
3. Thêm ví dụ ngắn, rồi kết thúc thay vì kéo dài không cần thiết.

## Nghe lại có tiêu chí

Khi nghe bản ghi của mình, hãy kiểm tra lần lượt độ rõ của ý, sự liền mạch và khả năng nghe hiểu. Không nên cố sửa tất cả lỗi trong một lượt luyện.
$body$, 'speaking', false, 'PUBLISHED', '2026-09-20'::timestamp, 'LEGACY_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'writing-toeic-tu-cau-dung-den-doan-viet-co-muc-dich', 'Kỹ năng TOEIC', 'Writing TOEIC: từ câu đúng đến đoạn viết có mục đích', 'Kiểm tra mục đích giao tiếp, mức độ đầy đủ và liên kết ý trước khi chỉ tập trung vào lỗi ngữ pháp.', $body$
## Một câu đúng chưa chắc đã giải quyết nhiệm vụ

Trong email hoặc phản hồi công việc, người đọc cần biết bạn đang xác nhận, yêu cầu hay đề xuất điều gì. Vì vậy, bước đầu tiên là kiểm tra xem đoạn viết đã hoàn thành đủ yêu cầu giao tiếp hay chưa.

## Checklist rà soát theo thứ tự

- Mục đích chính xuất hiện sớm và dễ nhận biết.
- Mỗi yêu cầu trong đề đều có thông tin phản hồi tương ứng.
- Các câu được nối theo một trình tự hợp lý.
- Ngữ pháp, từ vựng và dấu câu được kiểm tra ở lượt cuối.

## Lưu phiên bản để thấy cách mình sửa

Giữ bản nháp đầu và bản đã chỉnh giúp bạn nhận ra loại thay đổi nào thực sự làm thông điệp rõ hơn. Đây là dữ liệu hữu ích cho lần viết tiếp theo, không phải bằng chứng cho một mức điểm cố định.
$body$, 'writing', false, 'PUBLISHED', '2026-09-18'::timestamp, 'LEGACY_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'kiem-tra-dau-vao-hieu-qua', 'Hướng dẫn học', 'Kiểm tra đầu vào hiệu quả: làm bài như thế nào để kết quả phản ánh đúng khả năng hiện tại?', 'Chuẩn bị thiết bị, không gian và tâm thế phù hợp để lần đánh giá đầu vào có giá trị tham khảo tốt hơn.', $body$
## Chuẩn bị môi trường ổn định

Chọn nơi yên tĩnh, kiểm tra tai nghe và kết nối trước khi bắt đầu. Nếu bị gián đoạn, kết quả có thể phản ánh điều kiện làm bài nhiều hơn năng lực hiện tại.

## Trong khi làm bài

- Tự làm bài và không tra cứu tài liệu ngoài.
- Đọc hướng dẫn của từng phần trước khi trả lời.
- Không dành quá nhiều thời gian cho một câu nếu bài có giới hạn thời gian.
- Chỉ nộp khi đã kiểm tra trạng thái các phần cần hoàn thành.

## Hiểu đúng vai trò của kết quả

Kết quả đầu vào là một nguồn tham khảo cho lựa chọn học tập. Khả năng tiếp cận bài kiểm tra, dữ liệu còn thiếu hoặc phần chưa được đánh giá cần được xem cùng bối cảnh trước khi đưa ra quyết định.
$body$, 'placement', false, 'PUBLISHED', '2026-09-16'::timestamp, 'LEGACY_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'giu-nhip-hoc-tren-lop-va-online', 'Hướng dẫn học', '5 cách giữ nhịp học khi bạn vừa học trên lớp vừa tự học online', 'Biến lịch học kết hợp thành những phiên ngắn, có mục tiêu và đủ linh hoạt để duy trì trong nhiều tuần.', $body$
## Tạo một nhịp học có thể lặp lại

Lịch học tốt không nhất thiết dày. Điều quan trọng là bạn biết buổi nào để tiếp nhận kiến thức, buổi nào để luyện và khi nào cần xem lại phản hồi.

## Năm hành động thực tế

1. Đặt hai hoặc ba khung tự học cố định mỗi tuần.
2. Mỗi phiên chỉ chọn một kỹ năng hoặc một mục tiêu cụ thể.
3. Mở lại ghi chú trên lớp trước khi bắt đầu bài luyện online.
4. Ghi lại câu chưa hiểu để hỏi trong buổi học tiếp theo.
5. Cuối tuần, xem tiến độ và điều chỉnh kế hoạch thay vì học bù dồn dập.

## Khi lịch bị gián đoạn

Hãy quay lại bằng một nhiệm vụ ngắn và rõ ràng. Việc khôi phục nhịp học quan trọng hơn cố hoàn thành ngay toàn bộ phần đã bỏ lỡ.
$body$, 'study-rhythm', false, 'PUBLISHED', '2026-09-14'::timestamp, 'LEGACY_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'cach-doc-ket-qua-hoc-tap', 'Cập nhật chương trình', 'Đừng vội kết luận “tăng hay giảm”: cách đọc kết quả học tập theo từng lần đánh giá', 'Đọc kết quả theo kỹ năng, trạng thái dữ liệu và bối cảnh của từng lần đánh giá trước khi kết luận về xu hướng.', $body$
## Một con số không kể hết câu chuyện

Hai lần đánh giá có thể khác nhau về nội dung, độ khó, điều kiện làm bài hoặc phần kỹ năng đã hoàn tất. Vì vậy, tổng điểm không nên được dùng riêng lẻ để giải thích toàn bộ tiến độ.

## Ba lớp thông tin cần đọc

- Trạng thái: đã có đủ dữ liệu, đang chờ chấm hay còn thiếu phần đánh giá.
- Kỹ năng: thay đổi xuất hiện ở Listening, Reading, Speaking hay Writing.
- Bối cảnh: loại bài đánh giá và thời điểm thực hiện có tương đương hay không.

## Biến kết quả thành hành động học

Hãy chọn một hoặc hai tín hiệu có thể hành động, chẳng hạn kỹ năng cần luyện thêm hoặc loại câu hỏi thường mất thời gian. Khi dữ liệu đang chờ hoặc còn thiếu, giao diện cần thể hiện đúng trạng thái thay vì suy diễn thành xu hướng.
$body$, 'results', false, 'PUBLISHED', '2026-09-12'::timestamp, 'LEGACY_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

ALTER TABLE "public_content"
  ADD CONSTRAINT "public_content_admin_actor_check"
  CHECK (
    "origin" = 'LEGACY_IMPORT'::"PublicContentOrigin"
    OR ("createdById" IS NOT NULL AND "updatedById" IS NOT NULL)
  );

DO $$
DECLARE
  legacy_count integer;
  complete_count integer;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (
    WHERE length("bodyMarkdown") > 300
      AND (length("bodyMarkdown") - length(replace("bodyMarkdown", '## ', ''))) >= 9
  ) INTO legacy_count, complete_count
  FROM "public_content"
  WHERE "origin" = 'LEGACY_IMPORT'::"PublicContentOrigin";

  IF legacy_count <> 8 OR complete_count <> 8 THEN
    RAISE EXCEPTION 'M11 legacy public content bootstrap verification failed';
  END IF;
END $$;
