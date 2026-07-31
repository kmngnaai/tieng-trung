#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

printf '%s\n' '[1/16] Kiểm tra cú pháp Listening'
node --check modules/listening/core.js
node --check modules/listening/source-adapters.js
node --check modules/listening/activity-builders.js
node --check modules/listening/app.js

printf '%s\n' '[2/16] Python regression tests'
python3 -m unittest discover -s tests -p 'test_*.py'

printf '%s\n' '[3/16] LDSN1-4 runtime cũ'
node tests/test_ldsn14_runtime.js

printf '%s\n' '[4/16] Lookup navigation regression'
node tests/test_lookup_navigation_context_runtime.js

printf '%s\n' '[5/16] LDSN1-4 common schema và builders'
node tests/test_listening_ldsn_schema.js

printf '%s\n' '[6/16] LDSN1-4 app integration contract'
node tests/test_listening_ldsn_app_contract.js

printf '%s\n' '[7/16] New HSK Bài 2 schema và builders'
node tests/test_listening_new_hsk_sample.js

printf '%s\n' '[8/16] New HSK 1 mở rộng đủ 15 bài'
node tests/test_listening_new_hsk_expansion.js

printf '%s\n' '[9/16] New HSK app integration contract'
node tests/test_listening_new_hsk_app_contract.js

printf '%s\n' '[10/16] Learning UX contracts'
node tests/test_listening_learning_ux_contract.js

printf '%s\n' '[11/16] Kiểm tra kiến trúc Listening thống nhất'
node tests/test_listening_architecture_contract.js

printf '%s\n' '[12/16] Kiểm tra toàn bộ JSON structure New HSK'
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

printf '%s\n' '[13/16] Browser test audio controls và thanh nổi'
python3 scripts/test-listening-layout-browser.py

printf '%s\n' '[14/16] Browser test chép nguyên và sửa con trỏ'
python3 scripts/test-listening-full-dictation-browser.py

printf '%s\n' '[15/16] Browser test LDSN schema chung, resume và New HSK 15 bài'
python3 scripts/test-listening-sources-browser.py

printf '%s\n' '[16/16] Hoàn tất'
printf '%s\n' 'PASS: Listening common-schema automated test list'
