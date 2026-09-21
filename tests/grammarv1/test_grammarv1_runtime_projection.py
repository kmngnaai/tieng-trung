from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
from collections import Counter
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BUILDER = REPO_ROOT / "modules" / "GrammarV1" / "scripts" / "build_runtime_projection.py"

EXPECTED_TRACKS = {
    "hsk3.json": (47, 940),
    "hsk4.json": (40, 800),
    "hsk5.json": (101, 2020),
    "hsk6.json": (63, 1260),
    "new-hsk1.json": (40, 800),
    "new-hsk2.json": (45, 900),
    "new-hsk3.json": (63, 1260),
}
EXPECTED_TYPES = {
    "mcq": 3990,
    "translate_vi_zh": 1995,
    "translate_zh_vi": 1995,
}

G1_LOCKED_FILES = (
    Path("modules/GrammarV1/README.md"),
    Path("modules/GrammarV1/schema/grammar-exercise.schema.json"),
    Path("modules/GrammarV1/scripts/validate_exercises.py"),
    Path("modules/GrammarV1/source/exercises/.gitattributes"),
    Path("modules/GrammarV1/source/exercises/hsk3.json"),
    Path("modules/GrammarV1/source/exercises/hsk4.json"),
    Path("modules/GrammarV1/source/exercises/hsk5.json"),
    Path("modules/GrammarV1/source/exercises/hsk6.json"),
    Path("modules/GrammarV1/source/exercises/new-hsk1.json"),
    Path("modules/GrammarV1/source/exercises/new-hsk2.json"),
    Path("modules/GrammarV1/source/exercises/new-hsk3.json"),
    Path("modules/GrammarV1/source/exercises/source-manifest.json"),
    Path("tests/grammarv1/test_grammarv1_exercise_validator.py"),
)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def g1_hashes(root: Path) -> dict[str, str]:
    return {rel.as_posix(): sha256_file(root / rel) for rel in G1_LOCKED_FILES}


def load_builder():
    spec = importlib.util.spec_from_file_location("grammarv1_runtime_builder", BUILDER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="session", autouse=True)
def g1_final_source_is_read_only() -> None:
    before = g1_hashes(REPO_ROOT)
    yield
    after = g1_hashes(REPO_ROOT)
    assert after == before, "G2.1 mutated G1 FINAL files"


def test_runtime_projection_contract(tmp_path: Path) -> None:
    builder = load_builder()
    output = tmp_path / "runtime"
    index = builder.build_projection(REPO_ROOT, output)

    assert index["schemaVersion"] == "grammarv1-runtime-index-v1"
    assert index["totals"] == {
        "tracks": 7,
        "grammars": 399,
        "exercises": 7980,
        "types": EXPECTED_TYPES,
    }
    assert set(index["grammarToTrack"]) == {
        grammar_id
        for filename in EXPECTED_TRACKS
        for grammar_id in _grammar_ids_from_runtime(output / filename)
    }

    expected_files = {"index.json", *EXPECTED_TRACKS}
    assert {path.name for path in output.iterdir() if path.is_file()} == expected_files

    all_question_ids: list[str] = []
    all_grammar_ids: list[str] = []
    aggregate_types: Counter[str] = Counter()

    for filename, (expected_grammar_count, expected_exercise_count) in EXPECTED_TRACKS.items():
        track = json.loads((output / filename).read_text(encoding="utf-8"))
        assert track["schemaVersion"] == "grammarv1-runtime-track-v1"
        assert track["grammarCount"] == expected_grammar_count
        assert track["exerciseCount"] == expected_exercise_count
        assert len(track["grammars"]) == expected_grammar_count
        assert track["sources"]["grammar"]["sha256"]
        assert track["sources"]["exercises"]["sha256"]

        track_question_ids: list[str] = []
        track_exercise_total = 0
        for grammar in track["grammars"]:
            grammar_id = grammar["grammarId"]
            all_grammar_ids.append(grammar_id)
            assert index["grammarToTrack"][grammar_id] == filename
            assert grammar["source"]["path"] == track["sources"]["grammar"]["path"]
            assert grammar["exerciseCount"] == 20
            assert grammar["exerciseTypeCounts"] == {
                "mcq": 10,
                "translate_zh_vi": 5,
                "translate_vi_zh": 5,
            }
            exercises = grammar["exercises"]
            assert [row["seq"] for row in exercises] == list(range(1, 21))
            assert all(row["grammarId"] == grammar_id for row in exercises)
            assert len({row["questionId"] for row in exercises}) == 20
            type_counts = Counter(row["type"] for row in exercises)
            assert dict(type_counts) == grammar["exerciseTypeCounts"]
            aggregate_types.update(type_counts)
            ids = [row["questionId"] for row in exercises]
            track_question_ids.extend(ids)
            all_question_ids.extend(ids)
            track_exercise_total += len(exercises)

        assert track_exercise_total == expected_exercise_count
        assert len(track_question_ids) == len(set(track_question_ids))

    assert len(all_grammar_ids) == 399
    assert len(set(all_grammar_ids)) == 399
    assert len(all_question_ids) == 7980
    assert len(set(all_question_ids)) == 7980
    assert dict(sorted(aggregate_types.items())) == EXPECTED_TYPES


def _grammar_ids_from_runtime(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [row["grammarId"] for row in payload["grammars"]]


def test_runtime_projection_is_byte_deterministic(tmp_path: Path) -> None:
    builder = load_builder()
    first = tmp_path / "first"
    second = tmp_path / "second"
    builder.build_projection(REPO_ROOT, first)
    builder.build_projection(REPO_ROOT, second)

    first_files = sorted(path.name for path in first.iterdir() if path.is_file())
    second_files = sorted(path.name for path in second.iterdir() if path.is_file())
    assert first_files == second_files == sorted({"index.json", *EXPECTED_TRACKS})
    assert {
        name: (first / name).read_bytes()
        for name in first_files
    } == {
        name: (second / name).read_bytes()
        for name in second_files
    }



def test_runtime_projection_is_stable_across_grammar_line_endings(tmp_path: Path) -> None:
    builder = load_builder()
    fixture = tmp_path / "repo"
    shutil.copytree(REPO_ROOT / "modules" / "GrammarV1", fixture / "modules" / "GrammarV1")
    grammar_src = REPO_ROOT / "modules" / "hanzi-stroke" / "data" / "learning" / "grammar"
    grammar_dst = fixture / "modules" / "hanzi-stroke" / "data" / "learning" / "grammar"
    grammar_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(grammar_src, grammar_dst)

    def force_line_endings(crlf: bool) -> None:
        for path in grammar_dst.glob("*.json"):
            text = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
            if crlf:
                path.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))
            else:
                path.write_bytes(text.encode("utf-8"))

    force_line_endings(False)
    lf_output = tmp_path / "lf-runtime"
    builder.build_projection(fixture, lf_output)

    force_line_endings(True)
    crlf_output = tmp_path / "crlf-runtime"
    builder.build_projection(fixture, crlf_output)

    expected_files = sorted({"index.json", *EXPECTED_TRACKS})
    assert sorted(path.name for path in lf_output.iterdir() if path.is_file()) == expected_files
    assert sorted(path.name for path in crlf_output.iterdir() if path.is_file()) == expected_files
    assert {name: (lf_output / name).read_bytes() for name in expected_files} == {
        name: (crlf_output / name).read_bytes() for name in expected_files
    }

def test_builder_rejects_corrupted_g1_source_before_write(tmp_path: Path) -> None:
    builder = load_builder()
    fixture = tmp_path / "repo"
    shutil.copytree(REPO_ROOT / "modules" / "GrammarV1", fixture / "modules" / "GrammarV1")
    shutil.copytree(
        REPO_ROOT / "modules" / "hanzi-stroke" / "data" / "learning" / "grammar",
        fixture / "modules" / "hanzi-stroke" / "data" / "learning" / "grammar",
    )

    source = fixture / "modules" / "GrammarV1" / "source" / "exercises" / "hsk3.json"
    source.write_bytes(source.read_bytes() + b" ")
    output = tmp_path / "should-not-exist"

    with pytest.raises(builder.RuntimeProjectionError, match="G1 canonical source contract is not green"):
        builder.build_projection(fixture, output)
    assert not output.exists()
