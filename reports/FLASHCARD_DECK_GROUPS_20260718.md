# Flashcard Deck Groups — 2026-07-18

## Chức năng mới

- Tạo nhóm bộ thẻ tự tạo.
- Đổi tên nhóm và thêm mô tả.
- Nhóm nằm phía trên phần **Chưa phân nhóm**.
- Bấm nhóm để mở màn con và xem các bộ bên trong.
- Mỗi bộ chỉ thuộc một nhóm tại một thời điểm.
- Di chuyển bộ vào nhóm hoặc đưa về **Chưa phân nhóm** từ menu `⋯` của bộ.
- Tạo bộ mới khi đang ở trong nhóm sẽ tự lưu vào nhóm đó.
- Xuất riêng toàn bộ một nhóm thành JSON.
- Sao lưu toàn bộ đã nâng lên version 2, giữ `groups` và `groupId`.
- File JSON cũ không có nhóm vẫn nhập được; các bộ sẽ nằm ngoài nhóm.

## Xóa nhóm

Khi xóa nhóm có hai lựa chọn:

1. **Đưa về Chưa phân nhóm**
   - Xóa nhóm.
   - Giữ nguyên toàn bộ bộ thẻ và lịch sử học.

2. **Xóa nhóm và các bộ**
   - Nhóm và tất cả bộ bên trong được chuyển vào Thùng rác trong 30 ngày.
   - Có thể khôi phục nguyên nhóm cùng các bộ.

## IndexedDB

- Database version: `3`
- Object stores:
  - `decks`
  - `groups`
  - `trash`

Dữ liệu bộ cũ không bị xóa khi nâng cấp.

## Giao diện

- Header Bộ tự tạo có `Tạo nhóm` và `Tạo bộ`.
- Danh sách nhóm dùng card thư mục gọn.
- Màn nhóm có nút quay lại, tìm kiếm và sắp xếp riêng.
- Tạo/sửa nhóm và di chuyển bộ dùng sheet thân thiện với mobile.
- Các bộ chưa gom luôn hiển thị trong phần **Chưa phân nhóm**.
