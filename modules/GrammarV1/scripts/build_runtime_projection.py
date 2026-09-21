from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

RUNTIME_SCHEMA_VERSION = "grammarv1-runtime-track-v1"
INDEX_SCHEMA_VERSION = "grammarv1-runtime-index-v1"
DEFAULT_OUTPUT_REL = Path("_generated/GrammarV1/exercises")
GENERATOR_REL = "modules/GrammarV1/scripts/build_runtime_projection.py"
VALIDATOR_REL = Path("modules/GrammarV1/scripts/validate_exercises.py")
EXERCISE_SOURCE_REL = Path("modules/GrammarV1/source/exercises")


class RuntimeProjectionError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_utf8_lf(path: Path) -> str:
    """Hash UTF-8 text with line endings normalized to LF.

    Canonical grammar JSON is semantic source data but is not byte-preserved by
    a scoped .gitattributes contract. Normalizing only line endings keeps the
    runtime provenance hash stable across Windows/Linux Git checkout policies
    while still changing for substantive text edits.
    """
    text = path.read_text(encoding="utf-8")
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ) + "\n"
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(rendered)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeProjectionError(f"cannot import module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_locked_source(repo_root: Path):
    validator_path = repo_root / VALIDATOR_REL
    if not validator_path.is_file():
        raise RuntimeProjectionError(f"missing production validator: {VALIDATOR_REL.as_posix()}")
    validator = load_module("grammarv1_g1_validator", validator_path)
    report = validator.validate(repo_root, None)
    if report.get("status") != "PASS":
        problems = report.get("problems") or []
        preview = "; ".join(str(item) for item in problems[:5])
        raise RuntimeProjectionError(
            f"G1 canonical source contract is not green: {preview or 'unknown validation failure'}"
        )
    return validator, report


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_example(row: Any) -> dict[str, str] | None:
    if not isinstance(row, dict):
        return None
    chinese = clean_text(row.get("chinese") or row.get("hanzi") or row.get("zh"))
    pinyin = clean_text(row.get("pinyin"))
    vietnamese = clean_text(
        row.get("vietnamese") or row.get("vi") or row.get("meaningVi")
    )
    if not (chinese or pinyin or vietnamese):
        return None
    return {
        "chinese": chinese,
        "pinyin": pinyin,
        "vietnamese": vietnamese,
    }


def normalize_grammar_item(
    item: dict[str, Any],
    *,
    top: dict[str, Any],
    position: int,
    grammar_source_path: str,
) -> dict[str, Any]:
    grammar_id = clean_text(item.get("id"))
    if not grammar_id:
        raise RuntimeProjectionError(
            f"canonical grammar item missing id: {grammar_source_path}[{position - 1}]"
        )

    examples_raw = item.get("examples")
    if not isinstance(examples_raw, list):
        examples_raw = item.get("example")
    if not isinstance(examples_raw, list):
        examples_raw = []
    examples = [normalized for row in examples_raw if (normalized := normalize_example(row))]

    level_value = item.get("hsk_level")
    if level_value is None:
        level_value = item.get("level")
    if level_value is None:
        level_value = top.get("level")

    order_value = item.get("item_order")
    if order_value is None:
        order_value = item.get("order")
    if order_value is None:
        order_value = position

    chapter_value = item.get("from_book_chapter")
    if chapter_value is None:
        chapter_value = item.get("chapter")

    return {
        "grammarId": grammar_id,
        "curriculum": clean_text(item.get("curriculum") or top.get("curriculum")),
        "sourceKey": clean_text(item.get("sourceKey") or top.get("sourceKey")),
        "level": level_value,
        "levelId": clean_text(item.get("levelId") or top.get("levelId")),
        "order": order_value,
        "chapter": chapter_value,
        "topic": clean_text(item.get("topic")),
        "syntax": clean_text(item.get("grammar_syntax") or item.get("syntax")),
        "explanation": clean_text(
            item.get("grammar_explanation") or item.get("explanation")
        ),
        "tips": clean_text(item.get("grammar_tips") or item.get("tips")),
        "attentions": clean_text(
            item.get("grammar_attentions") or item.get("attentions")
        ),
        "examples": examples,
        "source": {
            "path": grammar_source_path,
            "itemIndex": position - 1,
        },
    }


def compact_exercise(record: dict[str, Any]) -> dict[str, Any]:
    typ = record.get("type")
    common = {
        "questionId": record["questionId"],
        "grammarId": record["grammarId"],
        "type": typ,
        "seq": record["seq"],
        "prompt": record["prompt"],
    }
    if typ == "mcq":
        common.update(
            {
                "options": [
                    {"id": option["id"], "text": option["text"]}
                    for option in record["options"]
                ],
                "answer": record["answer"],
                "explanation": record["explanation"],
            }
        )
        return common
    if typ in {"translate_zh_vi", "translate_vi_zh"}:
        common.update(
            {
                "pinyin": record["pinyin"],
                "referenceAnswer": record["referenceAnswer"],
            }
        )
        return common
    raise RuntimeProjectionError(f"unsupported exercise type: {typ!r}")


def build_projection(repo_root: Path, output_dir: Path) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    output_dir = output_dir.resolve()

    validator, validation_report = validate_locked_source(repo_root)
    expected_tracks = list(validator.EXPECTED_TRACKS.items())
    track_labels = validator.TRACK_LABELS

    exercise_dir = repo_root / EXERCISE_SOURCE_REL
    track_index_rows: list[dict[str, Any]] = []
    grammar_to_track: dict[str, str] = {}
    total_grammars = 0
    total_exercises = 0
    total_types: Counter[str] = Counter()

    for exercise_file, grammar_rel in expected_tracks:
        exercise_path = exercise_dir / exercise_file
        grammar_path = repo_root / grammar_rel
        exercises = read_json(exercise_path)
        grammar_doc = read_json(grammar_path)

        if not isinstance(exercises, list):
            raise RuntimeProjectionError(f"exercise source must be array: {exercise_file}")
        if not isinstance(grammar_doc, dict) or not isinstance(grammar_doc.get("items"), list):
            raise RuntimeProjectionError(f"canonical grammar must be object.items[]: {grammar_rel}")

        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for raw in exercises:
            grouped[str(raw["grammarId"])].append(compact_exercise(raw))

        runtime_grammars: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for position, raw_item in enumerate(grammar_doc["items"], start=1):
            if not isinstance(raw_item, dict):
                raise RuntimeProjectionError(
                    f"canonical grammar item must be object: {grammar_rel}[{position - 1}]"
                )
            grammar_meta = normalize_grammar_item(
                raw_item,
                top=grammar_doc,
                position=position,
                grammar_source_path=grammar_rel,
            )
            grammar_id = grammar_meta["grammarId"]
            if grammar_id in seen_ids:
                raise RuntimeProjectionError(f"duplicate canonical grammarId: {grammar_id}")
            seen_ids.add(grammar_id)

            linked = sorted(grouped.get(grammar_id, []), key=lambda row: int(row["seq"]))
            if len(linked) != 20:
                raise RuntimeProjectionError(
                    f"runtime grammar {grammar_id} linked exercises={len(linked)} expected=20"
                )
            seqs = [int(row["seq"]) for row in linked]
            if seqs != list(range(1, 21)):
                raise RuntimeProjectionError(
                    f"runtime grammar {grammar_id} seq={seqs} expected=1..20"
                )
            type_counts = Counter(str(row["type"]) for row in linked)
            expected_type_counts = {
                "mcq": 10,
                "translate_zh_vi": 5,
                "translate_vi_zh": 5,
            }
            if dict(type_counts) != expected_type_counts:
                raise RuntimeProjectionError(
                    f"runtime grammar {grammar_id} type counts={dict(type_counts)} expected={expected_type_counts}"
                )

            runtime_grammars.append(
                {
                    **grammar_meta,
                    "exerciseCount": len(linked),
                    "exerciseTypeCounts": expected_type_counts,
                    "exercises": linked,
                }
            )
            grammar_to_track[grammar_id] = exercise_file
            total_types.update(type_counts)

        if set(grouped) != seen_ids:
            unresolved = sorted(set(grouped) - seen_ids)
            missing = sorted(seen_ids - set(grouped))
            raise RuntimeProjectionError(
                f"runtime link mismatch {exercise_file}: unresolved={unresolved[:5]} missing={missing[:5]}"
            )

        track_payload = {
            "schemaVersion": RUNTIME_SCHEMA_VERSION,
            "track": {
                "id": Path(exercise_file).stem,
                "label": track_labels[exercise_file],
                "curriculum": clean_text(grammar_doc.get("curriculum")),
                "sourceKey": clean_text(grammar_doc.get("sourceKey")),
                "level": grammar_doc.get("level"),
                "levelId": clean_text(grammar_doc.get("levelId")),
            },
            "sources": {
                "grammar": {
                    "path": grammar_rel,
                    "sha256": sha256_utf8_lf(grammar_path),
                },
                "exercises": {
                    "path": (EXERCISE_SOURCE_REL / exercise_file).as_posix(),
                    "sha256": sha256_file(exercise_path),
                },
            },
            "grammarCount": len(runtime_grammars),
            "exerciseCount": len(exercises),
            "grammars": runtime_grammars,
        }
        write_json(output_dir / exercise_file, track_payload)

        track_index_rows.append(
            {
                "id": track_payload["track"]["id"],
                "label": track_payload["track"]["label"],
                "file": exercise_file,
                "curriculum": track_payload["track"]["curriculum"],
                "sourceKey": track_payload["track"]["sourceKey"],
                "level": track_payload["track"]["level"],
                "levelId": track_payload["track"]["levelId"],
                "grammarCount": len(runtime_grammars),
                "exerciseCount": len(exercises),
            }
        )
        total_grammars += len(runtime_grammars)
        total_exercises += len(exercises)

    validation_totals = validation_report.get("totals") or {}
    expected_types = validation_totals.get("types") or {}
    if total_grammars != int(validation_totals.get("grammarIds") or 0):
        raise RuntimeProjectionError(
            f"runtime grammar total={total_grammars} validator={validation_totals.get('grammarIds')}"
        )
    if total_exercises != int(validation_totals.get("exercises") or 0):
        raise RuntimeProjectionError(
            f"runtime exercise total={total_exercises} validator={validation_totals.get('exercises')}"
        )
    if dict(sorted(total_types.items())) != dict(sorted(expected_types.items())):
        raise RuntimeProjectionError(
            f"runtime type totals={dict(total_types)} validator={expected_types}"
        )

    index_payload = {
        "schemaVersion": INDEX_SCHEMA_VERSION,
        "generator": GENERATOR_REL,
        "sourceContract": validation_report.get("contractVersion"),
        "totals": {
            "tracks": len(track_index_rows),
            "grammars": total_grammars,
            "exercises": total_exercises,
            "types": dict(sorted(total_types.items())),
        },
        "tracks": track_index_rows,
        "grammarToTrack": dict(sorted(grammar_to_track.items())),
    }
    write_json(output_dir / "index.json", index_payload)
    return index_payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build deterministic GrammarV1 runtime projections from locked canonical sources."
    )
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    output = args.output
    if output is None:
        output = repo_root / DEFAULT_OUTPUT_REL
    elif not output.is_absolute():
        output = repo_root / output

    try:
        index = build_projection(repo_root, output)
    except Exception as exc:
        print(f"FAIL GrammarV1 runtime projection: {type(exc).__name__}: {exc}")
        return 2

    print(
        "PASS GrammarV1 runtime projection: "
        f"tracks={index['totals']['tracks']} "
        f"grammars={index['totals']['grammars']} "
        f"exercises={index['totals']['exercises']} "
        f"output={output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
