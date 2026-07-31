# Listening Expansion Rules

Tài liệu này khóa mục tiêu mở rộng tab **Nghe** để các patch sau không vá chồng, xóa nhầm chức năng hoặc đổi hướng giữa chừng.

## Mục tiêu cố định

Tab Nghe dùng một bộ máy chung cho New HSK, HSK 6 cấp, YCT, Boya, 301, LDSN14 và bộ tự tạo. Nội dung được chuẩn hóa theo ba tầng:

1. Từ.
2. Câu.
3. Hội thoại hoặc đoạn văn có cấu trúc.

Mẫu đầu tiên là **New HSK 1 – Bài 2: Tôi tên là Lý Văn**. Chỉ nhân rộng sau khi mẫu, schema và kiểm thử được chốt.

## Quy tắc bắt buộc

1. Không xóa chức năng Nghe hiện có nếu chưa có test tương đương.
2. Thêm adapter/schema trước, thay UI sau.
3. Mỗi từ, câu, lượt thoại và câu trong đoạn phải truy ngược được về nguồn qua `origin`.
4. Phân biệt `source`, `curated` và `authored`; không trình bày nội dung biên tập như dữ liệu gốc.
5. Không nối câu rời ngẫu nhiên để tạo hội thoại hoặc đoạn văn giả.
6. Không tự bịa pinyin, nghĩa hoặc audio khi dữ liệu thiếu.
7. UI chỉ hiện hoạt động có `capabilities = true`.
8. Audio thống nhất: MP3 người dùng nhập trước, nếu không có thì TTS thiết bị.
9. Không sử dụng URL audio nguồn của HSK/YCT/Boya trong tab Nghe.
10. Một câu dùng chung `canonicalItemId` ở mọi hoạt động để không lưu trùng MP3.
11. Hội thoại/đoạn phát bằng hàng đợi câu; chưa tạo file MP3 ghép mới.
12. Nghe từ mặc định 4 lựa chọn; mức khó 5 lựa chọn.
13. Từ nhiễu ưu tiên cùng bài/cấp, độ dài, loại từ và pinyin gần nhau; không lấy ngẫu nhiên toàn kho.
14. Ngữ pháp có bộ lọc riêng và được trộn mặc định trong `Toàn bộ`.
15. Ví dụ ngữ pháp không tự tham gia hội thoại/đoạn nếu chưa được biên tập rõ.
16. Xếp câu dùng token/cụm từ; không mặc định tách từng chữ.
17. Hội thoại dài xử lý theo `hội thoại → lượt → token`.
18. Đoạn dài xử lý theo `đoạn → câu → token`; không xáo toàn bộ từ của cả đoạn.
19. Mobile ưu tiên chạm chọn; kéo thả chỉ là cải tiến bổ sung.
20. Font không tự co quá nhỏ để nhét câu dài; nội dung phải xuống dòng hoặc chia phần.
21. Phiên học phải lưu mode, activity descriptor, group, bộ lọc, vị trí và thứ tự đã xáo.
22. Reload không được xáo lại đáp án hoặc làm mất tiến độ.
23. Dữ liệu localStorage/IndexedDB cũ không được xóa; thay schema phải có migration.
24. Dễ/Ôn/Khó và Câu cần ôn phải tiếp tục hoạt động theo từng item và activity.
25. Chỉ sửa file liên quan đến patch; không đổi tên hoặc refactor ngoài phạm vi.
26. Mỗi patch phải cập nhật: quyết định, file sửa, test tự động và test thủ công.
27. Nếu dữ liệu thực khác giả định, dừng mở rộng và cập nhật tài liệu trước khi code tiếp.
28. Sau mẫu New HSK 1, chuyển nguồn ưu tiên sang schema chung trước khi nhân rộng. Theo lộ trình hiện tại: LDSN1–4 làm trước; 301 tạm hoãn theo quyết định người dùng.
29. 301/LDSN14 là nguồn chuyển đổi và bảo toàn, không xây lại hoặc làm phẳng dữ liệu gốc.
30. HSK/YCT/Boya chỉ bật hội thoại và đoạn khi có structure hợp lệ đã được kiểm tra.
31. Mỗi tính năng lớn nằm trong một patch riêng: adapter → bảo toàn cũ → chọn từ → xếp câu → hội thoại → đoạn.
32. Mọi hoạt động đang luyện dùng chung một thanh audio nổi. Thanh mặc định ẩn; chỉ hiện dạng thu gọn khi audio card chính ra khỏi viewport hoặc bàn phím nhập mở; người học có thể mở rộng; nút quay về chỉ xuất hiện khi active learning target đã rời viewport.
33. Header học đang hoạt động phải cố định ở đầu màn hình, luôn giữ nút quay lại, tên nguồn/bài, thống kê ngắn và nút Trang chủ khi người học cuộn nội dung dài.
34. Xanh lá là màu hành động và nhận diện chính; pastel phụ chỉ dùng để phân tầng Từ/Câu/Hội thoại/Đoạn, không được cạnh tranh với trạng thái active, đúng/sai hoặc nút chính.

## Schema chung tối thiểu

```js
{
  source: {},
  unit: {},
  words: [],
  sentences: [],
  groups: [],
  capabilities: {},
  diagnostics: []
}
```

Mỗi câu chuẩn cần tối thiểu:

```js
{
  id,
  text,
  pinyin,
  meaning,
  tokens: [],
  sentenceType,
  originType,
  origin: { file, path, routeId }
}
```

## Trạng thái patch hiện tại

Đã hoàn thành nền tảng schema/activity builders và giao diện Nghe cơ bản.

Đã chuyển **LDSN1–4** sang schema chung:

- Adapter đọc đủ 10 bài từ `modules/ldsn14/data/lessons.json`.
- Bảo toàn từ vựng, dịch câu, ngữ pháp, hội thoại và đoạn văn từ nguồn.
- Hội thoại/đoạn giữ nguyên thứ tự và `canonicalSentenceId`.
- Bộ lọc Toàn bộ/Dịch câu/Hội thoại/Đoạn văn/Ngữ pháp dùng `sentenceFilters` và `tags` chung.
- Phiên LDSN lưu và khôi phục bằng cùng session descriptor với New HSK.
- Giao diện LDSN cũ vẫn có regression test riêng; không bị thay thế hoặc làm phẳng dữ liệu.

Đã mở rộng **New HSK 1 đủ 15 bài**:

- Bài 2 giữ mẫu chi tiết đã xác nhận.
- Bài 1 và 3–15 có structure riêng.
- Hội thoại/đoạn được biên tập từ các câu có thật trong dữ liệu nguồn và ghi `originType: curated`.
- Không nối câu ngoài bài hoặc gắn nhãn nội dung biên tập thành nội dung gốc.

Theo quyết định hiện tại:

- Không triển khai 301 trong đợt này.
- Bước tiếp theo sau kiểm thử là rà nội dung từng bài New HSK, rồi mở rộng HSK 6 cấp, YCT và Boya bằng adapter/structure tương ứng.

Thanh audio nổi, header cố định và hệ màu pastel tiếp tục là component/theme dùng chung; không tạo bản riêng theo nguồn.
