# New 3.0 Course

Module giáo trình **New 3.0** cho HSK 1–3, dùng một nguồn JSON mỗi bài để dựng đồng thời:

- **Bài học:** theo đúng thứ tự sách (`views.bookFlow`).
- **Nội dung:** gom theo từ vựng, hội thoại, ngữ pháp, bài đọc và bài tập (`views.groupedIndex`).
- **Luyện tập:** Flashcard, nghe, điền, nối, sắp xếp, gõ, dịch, hội thoại và cấu tạo/bộ thủ.
- Nguồn dùng chung cho module **Thẻ** và **Nghe** qua key kỹ thuật `new_hsk_course`.

## Phạm vi

| Cấp | Số bài | MP3 sách |
|---|---:|---:|
| HSK 1 | 15 | 93 |
| HSK 2 | 15 | 120 |
| HSK 3 | 18 | 144 |
| **Tổng** | **48** | **357** |

Tất cả 48 bài có trạng thái `app-ready` trong `data/manifest.json`.

## Cấu trúc chính

```text
modules/new-hsk-course/
├── index.html
├── app.js
├── style.css
├── data/
│   ├── manifest.json
│   ├── audio-audit.json
│   ├── full-course-validation.json
│   ├── hsk1/lesson-01.json ... lesson-15.json
│   ├── hsk2/lesson-01.json ... lesson-15.json
│   └── hsk3/lesson-01.json ... lesson-18.json
├── assets/audio/
│   ├── hsk1/lesson-01 ... lesson-15
│   ├── hsk2/lesson-01 ... lesson-15
│   └── hsk3/lesson-01 ... lesson-18
├── schema/new-hsk-course.v1.schema.json
└── source/
    ├── hsk1/
    ├── hsk2/
    └── hsk3/
```

## Audio

- Các nút **Audio hội thoại / Audio từ mới / Audio bài đọc** dùng MP3 sách.
- Nút loa của **một từ hoặc một câu riêng lẻ** vẫn dùng giọng thiết bị khi sách không cung cấp MP3 riêng cho mục đó.
- Báo cáo `data/audio-audit.json` phải có:
  - `missing: []`
  - `invalid: []`
  - `unexpected: []`

## Chạy local

```powershell
cd "D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web"
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/new-hsk-course/index.html?level=1&lesson=1&view=book
```

## Build và kiểm tra

Build lại 48 bài từ nguồn app-ready:

```powershell
python scripts/new-hsk-course/build_all_course_data.py --repo .
```

Kiểm tra cấu trúc, tham chiếu và audio:

```powershell
python scripts/new-hsk-course/validate_full_course.py --repo .
```

Kiểm tra trình duyệt responsive:

```powershell
python scripts/test-new-hsk-course-full-browser.py
```

Hoặc chạy bộ kiểm tra đầy đủ:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-new-hsk-course-full-local.ps1
```
