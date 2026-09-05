import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build_digest(seed: int) -> str:
    code = r"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
script = root / 'scripts/new-hsk-course/build_all_course_data.py'
spec = importlib.util.spec_from_file_location('build_all_course_data', script)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)
lesson_paths = []
for level, count in ((1, 15), (2, 15), (3, 18)):
    lesson_paths.extend(
        root / 'modules/new-hsk-course/data' / f'hsk{level}' / f'lesson-{number:02d}.json'
        for number in range(1, count + 1)
    )
payload = module.build_first_occurrence_index(root, lesson_paths)
blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
print(hashlib.sha256(blob).hexdigest())
"""
    env = os.environ.copy()
    env['PYTHONHASHSEED'] = str(seed)
    result = subprocess.run(
        [sys.executable, '-c', code, str(ROOT)],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    return result.stdout.strip()


def test_first_occurrence_is_independent_of_python_hash_seed():
    digests = {build_digest(seed) for seed in (1, 2, 777)}
    assert len(digests) == 1
