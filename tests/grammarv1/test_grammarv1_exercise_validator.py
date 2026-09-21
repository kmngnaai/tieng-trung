from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = REPO_ROOT / "modules" / "GrammarV1" / "scripts" / "validate_exercises.py"
REL_EX = Path("modules/GrammarV1/source/exercises")
REL_MANIFEST = REL_EX / "source-manifest.json"
TRACK = "hsk3.json"

LOCKED_TRACKS = (
    "hsk3.json",
    "hsk4.json",
    "hsk5.json",
    "hsk6.json",
    "new-hsk1.json",
    "new-hsk2.json",
    "new-hsk3.json",
)
LOCKED_FILES = tuple(REL_EX / name for name in LOCKED_TRACKS) + (
    REL_MANIFEST,
    Path("modules/GrammarV1/schema/grammar-exercise.schema.json"),
    Path("modules/GrammarV1/scripts/validate_exercises.py"),
)
KNOWN_WARNING_IDS = {
    "hsk3_13_mcq_1",
    "hsk3_13_mcq_4",
    "hsk3_13_mcq_7",
    "hsk6_59_mcq_8",
    "hsk3_new_19_mcq_7",
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def locked_hashes(root: Path) -> dict[str, str]:
    return {
        rel.as_posix(): sha256_file(root / rel)
        for rel in LOCKED_FILES
    }


@pytest.fixture(scope="session", autouse=True)
def canonical_source_is_read_only() -> None:
    before = locked_hashes(REPO_ROOT)
    yield
    after = locked_hashes(REPO_ROOT)
    assert after == before, "Regression tests mutated locked GrammarV1 source/schema/validator files"


def run_validator(root: Path, report_path: Path) -> tuple[int, dict]:
    proc = subprocess.run(
        [
            sys.executable,
            "-B",
            str(VALIDATOR),
            "--repo-root",
            str(root),
            "--report",
            str(report_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    assert report_path.exists(), (
        f"validator did not write report; rc={proc.returncode}; "
        f"stdout={proc.stdout!r}; stderr={proc.stderr!r}"
    )
    return proc.returncode, json.loads(report_path.read_text(encoding="utf-8"))


def copy_fixture(dest_root: Path) -> None:
    shutil.copytree(
        REPO_ROOT / "modules" / "GrammarV1",
        dest_root / "modules" / "GrammarV1",
    )
    grammar_src = REPO_ROOT / "modules" / "hanzi-stroke" / "data" / "learning" / "grammar"
    grammar_dst = dest_root / "modules" / "hanzi-stroke" / "data" / "learning" / "grammar"
    grammar_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(grammar_src, grammar_dst)


def load_track(root: Path, dest: str = TRACK) -> tuple[Path, list[dict]]:
    path = root / REL_EX / dest
    return path, json.loads(path.read_text(encoding="utf-8"))


def update_manifest_for(root: Path, dest: str = TRACK) -> None:
    manifest_path = root / REL_MANIFEST
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    target = root / REL_EX / dest
    for entry in manifest["tracks"]:
        if entry["destination"] == dest:
            entry["sha256"] = sha256_file(target)
            entry["bytes"] = target.stat().st_size
            break
    else:
        raise AssertionError(f"manifest destination missing: {dest}")
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def save_track(root: Path, data: list[dict], *, update_manifest: bool = True) -> None:
    path = root / REL_EX / TRACK
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if update_manifest:
        update_manifest_for(root, TRACK)


def mutate_duplicate_question_id(root: Path) -> None:
    _, data = load_track(root)
    data[1]["questionId"] = data[0]["questionId"]
    save_track(root, data)


def mutate_unresolved_grammar_id(root: Path) -> None:
    _, data = load_track(root)
    data[0]["grammarId"] = "hsk3_999"
    data[0]["questionId"] = "hsk3_999_mcq_1"
    save_track(root, data)


def mutate_bad_distribution(root: Path) -> None:
    _, data = load_track(root)
    data.pop()
    save_track(root, data)


def mutate_bad_answer(root: Path) -> None:
    _, data = load_track(root)
    data[0]["answer"] = "Z"
    save_track(root, data)


def mutate_unexpected_field(root: Path) -> None:
    _, data = load_track(root)
    data[0]["unexpected"] = "must fail"
    save_track(root, data)


def mutate_hash_corruption(root: Path) -> None:
    path = root / REL_EX / TRACK
    path.write_bytes(path.read_bytes() + b" ")
    # Deliberately do not update source-manifest.json.


def test_canonical_source_contract_is_green(tmp_path: Path) -> None:
    rc, report = run_validator(REPO_ROOT, tmp_path / "baseline-report.json")

    assert rc == 0
    assert report["status"] == "PASS"
    assert report["problems"] == []
    assert report["totals"] == {
        "tracks": 7,
        "exercises": 7980,
        "questionIdsUnique": 7980,
        "grammarIds": 399,
        "types": {
            "mcq": 3990,
            "translate_vi_zh": 1995,
            "translate_zh_vi": 1995,
        },
    }
    assert report["canonicalGrammar"]["resolvedGrammarIds"] == 399

    source_hashes = report["provenance"]["sourceHashes"]
    assert set(source_hashes) == set(LOCKED_TRACKS)
    for item in source_hashes.values():
        assert item["sha256"] == item["manifestSha256"]
        assert item["bytes"] == item["manifestBytes"]

    # CI/fresh-checkout tests do not require the external Xie ZIP.
    # The locked manifest/schema still carry and validate its audited SHA contract.
    assert report["provenance"]["archive"]["checked"] is False
    assert report["warningBaseline"]["matchesAuditedBaseline"] is True
    assert {w["questionId"] for w in report["warnings"]} == KNOWN_WARNING_IDS


BROKEN_CASES = (
    (
        "duplicate_question_id",
        mutate_duplicate_question_id,
        ("duplicate questionId", "unique questionId"),
    ),
    (
        "unresolved_grammar_id",
        mutate_unresolved_grammar_id,
        ("does not resolve to canonical grammar", "unique grammarId"),
    ),
    (
        "bad_distribution",
        mutate_bad_distribution,
        ("exercise total", "per-grammar distribution/seq invalid"),
    ),
    (
        "bad_answer",
        mutate_bad_answer,
        ("answer='Z' not allowed", "does not reference existing option id"),
    ),
    (
        "unexpected_field",
        mutate_unexpected_field,
        ("unexpected fields",),
    ),
    (
        "hash_corruption",
        mutate_hash_corruption,
        ("canonical source sha256 mismatch", "canonical source byte size mismatch"),
    ),
)


@pytest.mark.parametrize(
    ("case_name", "mutator", "expected_problem_tokens"),
    BROKEN_CASES,
    ids=[case[0] for case in BROKEN_CASES],
)
def test_broken_fixture_is_red(
    tmp_path: Path,
    case_name: str,
    mutator,
    expected_problem_tokens: tuple[str, ...],
) -> None:
    fixture_root = tmp_path / case_name
    copy_fixture(fixture_root)
    mutator(fixture_root)

    rc, report = run_validator(fixture_root, tmp_path / f"{case_name}-report.json")

    assert rc == 2
    assert report["status"] == "FAIL"
    assert report["problems"], "broken fixture must produce at least one blocker"
    problem_text = "\n".join(report["problems"])
    assert any(token in problem_text for token in expected_problem_tokens), (
        f"{case_name}: expected one of {expected_problem_tokens!r}; "
        f"actual problems={report['problems'][:8]!r}"
    )
