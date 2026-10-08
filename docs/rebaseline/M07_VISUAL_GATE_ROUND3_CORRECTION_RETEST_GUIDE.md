# Hướng dẫn retest M07 Visual Gate Round 3 Corrections

Tài liệu này hướng dẫn Product Owner kiểm tra bản sửa. Kết quả tự động của đội kỹ thuật không thay thế phê duyệt Visual Gate thủ công.

## 1. Chuẩn bị an toàn

Tại repo root, chạy:

```powershell
npm run prisma:seed
npm run check:m07-visual-gate-data
```

Đăng nhập Instructor bằng `instructor.demo@smart-elearning.local` và mật khẩu local trong `SEED_DEFAULT_PASSWORD`. Không ghi mật khẩu vào screenshot hoặc tài liệu.

Mọi bước xem, lọc, tìm kiếm, mở drawer, preview và tải tài liệu đều an toàn. Các thao tác nhập XLSX thật, lưu điểm, xuất bản, xóa hoặc thay đổi cấu trúc là thao tác ghi dữ liệu; chỉ thực hiện đúng bước được chỉ định và reseed sau đó.

## 2. R3-02 — Tổng quan và drill-down

1. Mở `Lớp giảng dạy` → `TOEIC-LR-2609-EVE` → `Tổng quan`.
2. Phải thấy `49/88 lượt hoàn thành (11 học viên × 8 bài)`.
3. Click lần lượt số/bucket `0–24%`, `25–49%`, `50–74%`, `75–99%`, `100%`.
4. Drawer phải hiện đúng tên, `x/8 bài`, hoạt động gần nhất và link `Mở chi tiết`.
5. Click `đã chấm đủ`, `đang chấm`, `chờ chấm`; phải thấy học viên, bài kiểm tra, lượt làm và thời điểm.
6. Trong từng bài kiểm tra click `đã nộp`, `đang làm`, `chưa nộp`; tổng từng nhóm phải khớp 11 học viên.
7. `Cần theo dõi` phải mở đúng 3 học viên từ timestamp seed.
8. Nếu FAIL, chụp toàn bộ KPI và drawer đang mở, kèm tên control đã click.

## 3. R3-04 — Hồ sơ học viên

Mở một học viên có kết quả → kiểm tra `Hoạt động gần đây` và `Xu hướng kỹ năng`.

- `Chờ chấm` phải tính cả attempt IN_CLASS thiếu một hay nhiều điểm kỹ năng FINAL; trường hợp chỉ có Nghe/Đọc FINAL hoặc thiếu Viết không được hiển thị là 0 chờ chấm.
- Một attempt đã chấm chỉ tạo một dòng kết quả chấm dễ hiểu, không lặp theo từng criterion.
- Copy phải nói rõ điểm nội bộ 0–100, chỉ dùng đợt đã chấm hoàn tất, không phải điểm TOEIC.
- Mỗi mốc có tên bài, ngày, kỹ năng; dữ liệu thiếu để trống.

Nếu FAIL, chụp phần activity/trend và ghi tên học viên.

## 4. R3-07 — Ngân hàng câu hỏi

1. Mở `Ngân hàng câu hỏi`, tìm `M07-VG-W-01`, rồi thử thêm `M07-VG-S-01` và `M07-VG-L-01`.
2. Phải thấy nội dung workplace tự đủ bối cảnh, loại trả lời, kỹ năng, độ khó, rubric hoặc hướng dẫn ngữ liệu cần thiết.
3. Kiểm tra filter skill/type/difficulty/usage và phân trang 20 câu/trang.
4. Nếu FAIL, chụp card câu hỏi cùng search/filter đang dùng.

## 5. R3-08/R3-09 — XLSX

Warning-only:

1. Chọn `scripts/fixtures/m07/M07_MANUAL_GATE_IMPORT_WARNING_ONLY.xlsx`.
2. Phải thấy `2/2 dòng hợp lệ`, `0 dòng cần sửa`, ít nhất 2 cảnh báo và nút `Xác nhận nhập` enabled.
3. Click `Xác nhận nhập`: phải mở dialog ghi rõ số câu hợp lệ, cảnh báo và khóa học đích.
4. Click `Quay lại xem trước`; không có câu nào được ghi.

Error:

1. Chọn `scripts/fixtures/m07/M07_MANUAL_GATE_IMPORT_ERROR.xlsx`.
2. Phải thấy row-level error và `Xác nhận nhập` disabled.

Nếu FAIL, chụp preview và dialog/disabled CTA. Không click nút `Nhập N câu` trong retest an toàn.

## 6. R3-10 — Test Builder residual retest

1. Mở `Đề kiểm tra` → `VG-R3 — Đề demo hướng dẫn` → `Chỉnh sửa`.
2. Bước 1 chỉ chứa loại/mục đích, tiêu đề, mô tả và bài học/ngữ cảnh; không có số lượt làm hoặc chính sách kết quả.
3. Bước 2 chỉ quản lý cấu trúc phần thi và phải có `1. Phần Nghe`, `2. Phần Đọc`, `3. Phần Nói`, `4. Phần Viết`; không có trình soạn ngữ liệu/câu hỏi.
4. Thử ↑/↓ ở phần đầu, giữa và cuối; thử hai click nhanh. Không được trắng trang. Refresh phải giữ thứ tự đã lưu và selected context hợp lệ.
5. Bước 3 chọn `Phần Nghe`, click `Thêm câu hỏi từ ngân hàng`, tìm `M07-VG-L-`; skill phải giữ Nghe, pagination rõ, selection giữ qua trang. Đóng picker mà không thêm.
6. Bước 4 chỉ có số lượt làm, chính sách xem kết quả và checklist readiness; không lặp tiêu đề/mô tả/bài học của Bước 1.
7. Bước 5 phải là preview chỉ đọc giống học viên: hiển thị ngữ liệu, nội dung câu và đúng hình thức radio/checkbox/text/audio; tuyệt đối không lộ đáp án đúng. Không click `Xuất bản`.
8. Nếu FAIL, chụp toàn trang, Console và Network response đã lược bỏ token/cookie.

Sau thao tác reorder, reset:

```powershell
npm run prisma:seed
npm run check:m07-visual-gate-data
```

## 7. R3-11 — Results Periodic

Mở `Kết quả` → `Kiểm tra thường kỳ 01`.

- Completion: 11 đang học, 6 đã chấm đủ, 2 chờ chấm, 3 chưa nộp.
- Denominator cuối: Nghe 8/11, Đọc 8/11, Nói 7/11, Viết 6/11.
- Bucket là số học viên trong `<50`, `50–69`, `70–84`, `85–100`, FINAL-only.
- Click bucket phải lọc ra đúng tên; `Mở hồ sơ` phải đi đúng learner.
- Biểu đồ trend có đúng một mốc Periodic rồi đến Midterm từ trái sang phải, ngày tăng dần, trục 0–100, bốn chuỗi kỹ năng, chú giải, ngày, giá trị và sample count; assessment không có mẫu điểm không xuất hiện và dữ liệu kỹ năng thiếu không được đổi thành 0.

## 8. Residual checks — status, demo answers, activity and XLSX

- Trong `Lớp giảng dạy`, lớp `TOEIC-REA-02` phải hiển thị `Đã hủy`; bộ lọc có `Đã hủy`, không có pseudo-status `Đã đóng`. Lớp hoàn tất vẫn hiển thị `Đã kết thúc`.
- Trong Question Bank, mở `M07-VG-L-01` và `M07-VG-R-01`: mỗi câu có bốn phương án có nghĩa, khác nhau và chỉ một đáp án đúng theo ngữ cảnh workplace.
- Trong hồ sơ học viên, một nhóm `AnswerEvaluation` phải được mô tả là số câu tự luận đã có kết quả chấm, không gọi là số “tiêu chí”.
- Trong xác nhận XLSX, `Khóa học đích` phải là tên khóa học dễ đọc, không phải UUID.

Nếu FAIL, chụp completion, bucket đã click và learner matrix đã lọc.

## 9. R3-12 — Pending/missing evidence

Mở `Kiểm tra giữa kỳ`, tìm `Đặng Bảo Long`.

- Completion: 5 đã chấm đủ, 2 chờ chấm, 4 chưa nộp.
- Denominator: Nghe 7/11, Đọc 7/11, Nói 6/11, Viết 5/11.
- Nói/Viết phải là `Đang chờ` hoặc `Chưa có`, tuyệt đối không hiển thị `0%`.
- Click `chờ chấm` phải lọc đúng learner/attempt.

Nếu FAIL, chụp cả completion, denominator và dòng Đặng Bảo Long. Đây là bằng chứng riêng bắt buộc cho R3-12.

## 10. R3-15 — Student resource

Đăng xuất Instructor, đăng nhập `student.demo@smart-elearning.local`, mở lớp `TOEIC-LR-2609-EVE` → `Nội dung học tập` → `Welcome & Course Overview`.

- `Trải nghiệm bài thi TOEIC Listening & Reading` phải thu gọn mặc định.
- Click `Xem video trong bài học`: iframe 16:9 mới được mount, không autoplay; có `Thu gọn video` và action phụ `Mở trên YouTube`.
- `Cẩm nang học tập của lớp` tải file `cam-nang-hoc-tap.txt`, không lộ storage key/path/JSON.
- `Tài nguyên TOEIC tham khảo` mở như external link, không iframe.

Nếu FAIL, chụp danh sách resource ở trạng thái thu gọn và video sau khi mở.

## 11. Responsive và kết thúc

Kiểm tra tối thiểu Tổng quan, Hồ sơ học viên, Test Builder, Results và Student resource tại:

- Desktop `1440×900`
- Tablet `820×1180`
- Mobile `390×844`

Không được overflow ngang toàn trang, chart/card/button không đè nhau, drawer/picker/wizard phải thao tác được.

Sau mọi mutation, chạy lại seed và validator. Gửi screenshot FAIL cùng bước, kích thước viewport, tên learner/assessment và Console/Network đã sanitized. Product Owner tự ghi PASS/FAIL; tài liệu này không tuyên bố Visual Gate PASS.
