$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo

Write-Host "[1/7] JavaScript syntax" -ForegroundColor Cyan
node --check modules/new-hsk-course/app.js
node --check modules/listening/app.js
node --check modules/listening/source-adapters.js
node --check modules/shared/app-shell.js

Write-Host "[2/7] Full course validator" -ForegroundColor Cyan
python scripts/new-hsk-course/validate_full_course.py --repo .

Write-Host "[3/7] Shared Flashcard/Listening source" -ForegroundColor Cyan
node tests/test_new_hsk_course_shared_sources.js

Write-Host "[4/7] Python regression" -ForegroundColor Cyan
python -m unittest discover -s tests -p "test_*.py"

Write-Host "[5/7] Node regression" -ForegroundColor Cyan
Get-ChildItem tests -Filter "test_*.js" | Sort-Object Name | ForEach-Object {
    node $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Node test failed: $($_.Name)" }
}

Write-Host "[6/7] Browser responsive" -ForegroundColor Cyan
python scripts/test-new-hsk-course-full-browser.py

Write-Host "[7/7] Audio audit summary" -ForegroundColor Cyan
python -c "import json,pathlib; d=json.loads(pathlib.Path('modules/new-hsk-course/data/audio-audit.json').read_text(encoding='utf-8')); assert not d['missing'] and not d['invalid'] and not d['unexpected']; print(f\"PASS: {d['importedCount']} MP3, {d['totalDurationSeconds']} seconds, no missing audio\")"

Write-Host "New 3.0 HSK 1-3: ALL PASS" -ForegroundColor Green
