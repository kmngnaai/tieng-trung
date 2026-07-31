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
28. Sau mẫu New HSK 1, chuyển 301 và LDSN14 sang schema chung trước khi nhân rộng hàng loạt.
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

Đã hoàn thành mẫu local New HSK 1 gồm:

- Adapter New HSK và ngữ pháp.
- Một structure mẫu có hội thoại 8 lượt và đoạn văn 4 câu.
- Chọn từ 4/5 đáp án.
- Điền tay từ bằng bộ máy chép hiện có.
- Xếp từ thành câu.
- Chép câu và transcript.
- Xếp lượt hội thoại, xếp từng câu hội thoại, chép từng lượt.
- Xếp câu trong đoạn, xếp từng câu trong đoạn, chép đoạn từng câu.
- Bộ lọc Toàn bộ/Câu ví dụ/Ngữ pháp.
- Lưu descriptor để khôi phục phiên và dùng chung canonical ID cho MP3.

Chưa nhân rộng sang nguồn khác trong patch này.
Bổ sung trong patch thanh audio nổi theo ngữ cảnh:

- Một renderer `renderFloatingAudioControls()` dùng chung cho chọn từ, xếp từ, xếp thứ tự, chép câu và transcript.
- Không còn floating audio riêng cho dictation.
- Mặc định ẩn; tự hiện thu gọn khi audio card chính không còn trong viewport hoặc input IME đang focus trên mobile.
- Nút quay về dùng `data-learning-target`; với chép chính tả quay đúng active slot, với activity khác quay về vùng trả lời hiện tại.
- Desktop không hiện thanh nổi.


Bổ sung trong patch header cố định và pastel:

- Xóa nội dung giới thiệu bản thử local khỏi giao diện người học.
- Header chuyển sang fixed thực sự, có khoảng đệm tương ứng để không che nội dung.
- Thêm bảng màu pastel semantic: xanh mint cho Từ, vàng kem cho Câu, cam đào cho Hội thoại, xanh trời cho Đoạn, tím nhạt cho bộ lọc nội dung.
- Xanh lá tiếp tục là màu chủ đạo cho nút active, progress, audio và trạng thái học.
