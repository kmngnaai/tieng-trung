# Tab Nghe V1.16 — Thư viện nhóm/bộ/câu

Bản này **thay toàn bộ subsystem Bộ tự tạo cũ**, không giữ song song logic danh sách phẳng.

## Cấu trúc mới

```text
Thư viện Nghe
├── Nhóm
│   ├── Bộ / đoạn
│   │   └── Câu
│   └── Bộ / đoạn
└── Chưa phân nhóm
    └── Bộ / đoạn
```

Ví dụ file đi kèm:

```text
301 · Bài 1–5 · Đoạn nghe tổng hợp
├── Đoạn 1 · Buổi sáng ở trường — 6 câu
├── Đoạn 2 · Làm quen bạn mới — 7 câu
└── Đoạn 3 · Bạn đi đâu? — 7 câu
```

## Chức năng

- Nhập JSON giữ nguyên `groups → decks → cards`, không làm phẳng thành một bộ 20 câu.
- Nhập file cũ không có nhóm: bộ nằm trong **Chưa phân nhóm**.
- Nhập theo kiểu gộp giống Thẻ: ID đã tồn tại được cập nhật, ID mới được thêm.
- Xuất toàn bộ thư viện.
- Xuất riêng một nhóm.
- Xuất riêng một bộ.
- Chọn câu được hoặc không được dùng khi luyện nghe.
- Xóa một bộ: chuyển vào Thùng rác 30 ngày.
- Xóa nhóm có hai lựa chọn:
  1. Đưa các bộ về **Chưa phân nhóm**.
  2. Xóa nhóm và các bộ vào Thùng rác.
- Thùng rác:
  - khôi phục từng mục;
  - xóa vĩnh viễn từng mục;
  - khôi phục tất cả;
  - dọn sạch;
  - tự dọn mục quá 30 ngày.
- Xóa bộ/nhóm không xóa lịch sử Dễ / Ôn / Khó.
- Dữ liệu cũ từ `tieng-trung-listening-custom-v1` được di chuyển một lần sang thư viện mới và khóa cũ vẫn được giữ lại.

## Lưu trữ

```text
IndexedDB: tiengTrungListeningLibrary
Version: 1
Stores:
- groups
- decks
- trash
```

## Cài đặt

Giải nén gói ở ngoài repo, sau đó chạy:

```powershell
python .\install_listening_library_v1_16.py "D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web"
```

Trình cài đặt:

1. Sao lưu `app.js`, `style.css`, `index.html` vào:
   `modules/listening/backup-before-library-v1.16/`
2. Xóa logic Bộ tự tạo dạng phẳng cũ khỏi `app.js`.
3. Thay bằng một logic thư viện duy nhất.
4. Thêm `modules/listening/library-store.js`.
5. Cập nhật version CSS/JS để tránh cache cũ.

Không chạy lặp. Nếu đã cài, script sẽ dừng và không chèn thêm logic.

## Chạy thử

```powershell
Set-Location "D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web"
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/listening/?v=16
```

## Checklist

1. Nhập file `301-bai-1-5-doan-nghe-tong-hop-v2.json`.
2. Màn thư viện phải hiện **1 nhóm**.
3. Mở nhóm phải thấy **3 bộ riêng**, lần lượt 6 / 7 / 7 câu.
4. Mở từng bộ chỉ thấy câu của đúng đoạn đó.
5. Xuất nhóm rồi xóa nhóm.
6. Chọn **Đưa về Chưa phân nhóm**: 3 bộ vẫn còn.
7. Tạo lại bằng cách nhập file, xóa nhóm và các bộ: nhóm xuất hiện trong Thùng rác.
8. Khôi phục: nhóm và 3 bộ trở lại.
9. Xuất riêng một bộ và nhập lại.
10. Reload trang: dữ liệu vẫn tồn tại.

## Commit

```powershell
Set-Location "D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web"; git add modules/listening; git commit -m "refactor(listening): replace flat custom imports with grouped library"; $branch = git branch --show-current; git push origin $branch
```
