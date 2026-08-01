#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

printf '%s\n' '[1/20] Kiểm tra cú pháp Listening'
node --check modules/listening/core.js
node --check modules/listening/source-adapters.js
node --check modules/listening/activity-builders.js
node --check modules/listening/app.js
node --check modules/listening/library-store.js
node --check modules/shared/import-core.js
node --check modules/shared/ai-prompt-templates.js
node --check modules/hanzi-stroke/app.js

printf '%s\n' '[2/20] Python regression tests'
python3 -m unittest discover -s tests -p 'test_*.py'

printf '%s\n' '[3/20] LDSN1-4 runtime cũ'
node tests/test_ldsn14_runtime.js

printf '%s\n' '[4/20] Lookup navigation regression'
node tests/test_lookup_navigation_context_runtime.js

printf '%s\n' '[5/20] LDSN1-4 common schema và builders'
node tests/test_listening_ldsn_schema.js

printf '%s\n' '[6/20] LDSN1-4 app integration contract'
node tests/test_listening_ldsn_app_contract.js

printf '%s\n' '[7/20] New HSK Bài 2 schema và builders'
node tests/test_listening_new_hsk_sample.js

printf '%s\n' '[8/20] New HSK 1 mở rộng đủ 15 bài'
node tests/test_listening_new_hsk_expansion.js

printf '%s\n' '[9/20] New HSK app integration contract'
node tests/test_listening_new_hsk_app_contract.js

printf '%s\n' '[10/20] Learning UX contracts'
node tests/test_listening_learning_ux_contract.js

printf '%s\n' '[11/20] Kiểm tra kiến trúc Listening thống nhất'
node tests/test_listening_architecture_contract.js

printf '%s\n' '[12/20] Import core, migration và curriculum contracts'
node tests/test_import_core_contract.js

printf '%s\n' '[13/20] Kiểm tra toàn bộ JSON structure New HSK'
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const dir = path.join('modules', 'listening', 'data', 'structures', 'new-hsk');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
for (const unit of manifest.units) {
  JSON.parse(fs.readFileSync(path.join(dir, unit.structureFile), 'utf8'));
}
console.log(`Validated ${manifest.units.length} New HSK structure files.`);
NODE

printf '%s\n' '[14/20] Browser test audio controls và thanh nổi'
python3 scripts/test-listening-layout-browser.py

printf '%s\n' '[15/20] Browser test chép nguyên và sửa con trỏ'
python3 scripts/test-listening-full-dictation-browser.py

printf '%s\n' '[16/20] Browser test LDSN schema chung, resume và New HSK 15 bài'
python3 scripts/test-listening-sources-browser.py

printf '%s\n' '[17/20] Browser test nhập JSON, XLSX, CSV và TXT'
python3 scripts/test-import-core-browser.py

printf '%s\n' '[18/20] Browser test 课 – HSK & Giáo trình trong tab Thẻ'
python3 scripts/test-flashcard-curriculum-browser.py

printf '%s\n' '[19/20] Browser test Thẻ theo bài, AI Prompt Builder và Chép nhiều câu'
python3 scripts/test-patch2abc-browser.py

printf '%s\n' '[20/20] Hoàn tất'
printf '%s\n' 'PASS: Listening, import library, curriculum browser and Patch 2A/2B/2C automated test list'
