from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

REPORT_SCHEMA_VERSION = "grammarv1-validator-report-v1"
EXPECTED_TRACKS = {
    "hsk3.json": "modules/hanzi-stroke/data/learning/grammar/hsk_3.json",
    "hsk4.json": "modules/hanzi-stroke/data/learning/grammar/hsk_4.json",
    "hsk5.json": "modules/hanzi-stroke/data/learning/grammar/hsk_5.json",
    "hsk6.json": "modules/hanzi-stroke/data/learning/grammar/hsk_6.json",
    "new-hsk1.json": "modules/hanzi-stroke/data/learning/grammar/new_hsk_1.json",
    "new-hsk2.json": "modules/hanzi-stroke/data/learning/grammar/new_hsk_2.json",
    "new-hsk3.json": "modules/hanzi-stroke/data/learning/grammar/new_hsk_3.json",
}
TRACK_LABELS = {
    "hsk3.json": "HSK3",
    "hsk4.json": "HSK4",
    "hsk5.json": "HSK5",
    "hsk6.json": "HSK6",
    "new-hsk1.json": "NEW_HSK1",
    "new-hsk2.json": "NEW_HSK2",
    "new-hsk3.json": "NEW_HSK3",
}


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def is_int_not_bool(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and len(value) >= 1


def add_problem(problems: list[str], message: str) -> None:
    problems.append(message)


def structural_validate_record(
    record: Any,
    *,
    file_name: str,
    index: int,
    defs: dict[str, Any],
    problems: list[str],
) -> None:
    where = f"{file_name}[{index}]"
    if not isinstance(record, dict):
        add_problem(problems, f"{where}: record must be object")
        return

    typ = record.get("type")
    branch_name = {
        "mcq": "mcq",
        "translate_zh_vi": "translateZhVi",
        "translate_vi_zh": "translateViZh",
    }.get(typ)
    if branch_name is None:
        add_problem(problems, f"{where}: unsupported type={typ!r}")
        return

    branch = defs[branch_name]
    required = set(branch.get("required", []))
    actual = set(record.keys())
    missing = sorted(required - actual)
    extra = sorted(actual - set(branch.get("properties", {}).keys()))
    if missing:
        add_problem(problems, f"{where}: missing fields={missing}")
    if branch.get("additionalProperties") is False and extra:
        add_problem(problems, f"{where}: unexpected fields={extra}")

    props = branch.get("properties", {})
    qid = record.get("questionId")
    gid = record.get("grammarId")
    seq = record.get("seq")

    qid_pattern = props.get("questionId", {}).get("pattern")
    gid_pattern = defs.get("grammarId", {}).get("pattern")
    if not isinstance(qid, str) or not qid_pattern or re.fullmatch(qid_pattern, qid) is None:
        add_problem(problems, f"{where}: questionId does not match schema pattern")
    if not isinstance(gid, str) or not gid_pattern or re.fullmatch(gid_pattern, gid) is None:
        add_problem(problems, f"{where}: grammarId does not match schema pattern")

    type_const = props.get("type", {}).get("const")
    if typ != type_const:
        add_problem(problems, f"{where}: type={typ!r} expected={type_const!r}")

    seq_rule = props.get("seq", {})
    if not is_int_not_bool(seq):
        add_problem(problems, f"{where}: seq must be integer")
    else:
        minimum = seq_rule.get("minimum")
        maximum = seq_rule.get("maximum")
        if minimum is not None and seq < minimum:
            add_problem(problems, f"{where}: seq={seq} below minimum={minimum}")
        if maximum is not None and seq > maximum:
            add_problem(problems, f"{where}: seq={seq} above maximum={maximum}")

    for key in ("prompt",):
        if key in record and not nonempty_string(record[key]):
            add_problem(problems, f"{where}: {key} must be non-empty string")

    if typ == "mcq":
        if "explanation" in record and not nonempty_string(record["explanation"]):
            add_problem(problems, f"{where}: explanation must be non-empty string")
        options = record.get("options")
        expected_ids = ["A", "B", "C", "D"]
        if not isinstance(options, list) or len(options) != 4:
            add_problem(problems, f"{where}: options must contain exactly 4 items")
        else:
            for pos, (option, expected_id) in enumerate(zip(options, expected_ids)):
                ow = f"{where}.options[{pos}]"
                if not isinstance(option, dict):
                    add_problem(problems, f"{ow}: option must be object")
                    continue
                if set(option.keys()) != {"id", "text"}:
                    add_problem(problems, f"{ow}: option fields must be exactly ['id','text']")
                if option.get("id") != expected_id:
                    add_problem(problems, f"{ow}: id={option.get('id')!r} expected={expected_id!r}")
                if not nonempty_string(option.get("text")):
                    add_problem(problems, f"{ow}: text must be non-empty string")
        answer_rule = props.get("answer", {}).get("enum", [])
        answer = record.get("answer")
        if answer not in answer_rule:
            add_problem(problems, f"{where}: answer={answer!r} not allowed")
    else:
        for key in ("pinyin", "referenceAnswer"):
            if key in record and not nonempty_string(record[key]):
                add_problem(problems, f"{where}: {key} must be non-empty string")


def expected_question_id(record: dict[str, Any]) -> str | None:
    gid = record.get("grammarId")
    typ = record.get("type")
    seq = record.get("seq")
    if not isinstance(gid, str) or not is_int_not_bool(seq):
        return None
    if typ == "mcq" and 1 <= seq <= 10:
        return f"{gid}_mcq_{seq}"
    if typ == "translate_zh_vi" and 11 <= seq <= 15:
        return f"{gid}_zhvi_{seq - 10}"
    if typ == "translate_vi_zh" and 16 <= seq <= 20:
        return f"{gid}_vizh_{seq - 15}"
    return None


def load_canonical_grammar_ids(repo_root: Path, problems: list[str]) -> tuple[dict[str, set[str]], dict[str, Any]]:
    result: dict[str, set[str]] = {}
    details: dict[str, Any] = {}
    for exercise_name, rel in EXPECTED_TRACKS.items():
        path = repo_root / rel
        label = TRACK_LABELS[exercise_name]
        if not path.exists():
            add_problem(problems, f"canonical grammar missing: {rel}")
            result[exercise_name] = set()
            continue
        try:
            data = load_json(path)
        except Exception as exc:
            add_problem(problems, f"canonical grammar parse failed: {rel}: {exc}")
            result[exercise_name] = set()
            continue
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            add_problem(problems, f"canonical grammar invalid structure: {rel}: expected object.items[]")
            result[exercise_name] = set()
            continue
        ids: list[str] = []
        for i, item in enumerate(data["items"]):
            if not isinstance(item, dict) or not nonempty_string(item.get("id")):
                add_problem(problems, f"canonical grammar invalid item id: {rel}[{i}]")
                continue
            ids.append(item["id"])
        if len(ids) != len(set(ids)):
            add_problem(problems, f"canonical grammar duplicate ids: {rel}")
        if isinstance(data.get("total"), int) and data["total"] != len(ids):
            add_problem(problems, f"canonical grammar total mismatch: {rel}: total={data['total']} items={len(ids)}")
        result[exercise_name] = set(ids)
        details[label] = {"path": rel, "count": len(ids)}
    return result, details


def validate_manifest(
    repo_root: Path,
    exercise_dir: Path,
    schema: dict[str, Any],
    source_archive: Path | None,
    problems: list[str],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    manifest_path = exercise_dir / "source-manifest.json"
    if not manifest_path.exists():
        add_problem(problems, "missing source-manifest.json")
        return {}, {"status": "FAIL", "path": manifest_path.as_posix()}
    try:
        manifest = load_json(manifest_path)
    except Exception as exc:
        add_problem(problems, f"source-manifest.json parse failed: {exc}")
        return {}, {"status": "FAIL", "path": manifest_path.as_posix()}

    contract = schema.get("x-grammarV1Contract", {})
    baseline = contract.get("auditedBaseline", {})
    expected_archive_sha = baseline.get("sourceArchiveSha256")
    expected_repo_commit = baseline.get("repoCommit")
    expected_exercises = baseline.get("exercises")
    expected_grammar_ids = baseline.get("grammarIds")

    if manifest.get("schemaVersion") != "grammarv1-source-manifest-v1":
        add_problem(problems, f"manifest schemaVersion unexpected: {manifest.get('schemaVersion')!r}")
    if manifest.get("baselineCommit") != expected_repo_commit:
        add_problem(problems, "manifest baselineCommit does not match schema audited baseline")
    if manifest.get("sourceArchiveSha256") != expected_archive_sha:
        add_problem(problems, "manifest sourceArchiveSha256 does not match schema audited baseline")
    if manifest.get("trackCount") != len(EXPECTED_TRACKS):
        add_problem(problems, f"manifest trackCount={manifest.get('trackCount')} expected={len(EXPECTED_TRACKS)}")
    if manifest.get("expectedExerciseCount") != expected_exercises:
        add_problem(problems, f"manifest expectedExerciseCount={manifest.get('expectedExerciseCount')} expected={expected_exercises}")
    if manifest.get("expectedGrammarIdCount") != expected_grammar_ids:
        add_problem(problems, f"manifest expectedGrammarIdCount={manifest.get('expectedGrammarIdCount')} expected={expected_grammar_ids}")
    if manifest.get("importMode") != "byte-preserved-json-content":
        add_problem(problems, f"manifest importMode unexpected: {manifest.get('importMode')!r}")

    track_entries = manifest.get("tracks")
    if not isinstance(track_entries, list):
        add_problem(problems, "manifest tracks must be an array")
        track_entries = []

    by_dest: dict[str, dict[str, Any]] = {}
    for i, entry in enumerate(track_entries):
        if not isinstance(entry, dict):
            add_problem(problems, f"manifest tracks[{i}] must be object")
            continue
        dest = entry.get("destination")
        if not isinstance(dest, str):
            add_problem(problems, f"manifest tracks[{i}].destination invalid")
            continue
        if dest in by_dest:
            add_problem(problems, f"manifest duplicate destination: {dest}")
        by_dest[dest] = entry

    if set(by_dest) != set(EXPECTED_TRACKS):
        add_problem(problems, f"manifest destinations mismatch: actual={sorted(by_dest)} expected={sorted(EXPECTED_TRACKS)}")

    source_hashes: dict[str, Any] = {}
    for dest in EXPECTED_TRACKS:
        entry = by_dest.get(dest)
        path = exercise_dir / dest
        if entry is None:
            continue
        if not path.exists():
            add_problem(problems, f"canonical exercise file missing: {dest}")
            continue
        raw = path.read_bytes()
        actual_sha = sha256_bytes(raw)
        expected_sha = entry.get("sha256")
        actual_bytes = len(raw)
        expected_bytes = entry.get("bytes")
        if actual_sha != expected_sha:
            add_problem(problems, f"canonical source sha256 mismatch: {dest}: actual={actual_sha} manifest={expected_sha}")
        if actual_bytes != expected_bytes:
            add_problem(problems, f"canonical source byte size mismatch: {dest}: actual={actual_bytes} manifest={expected_bytes}")
        source_hashes[dest] = {
            "sha256": actual_sha,
            "bytes": actual_bytes,
            "manifestSha256": expected_sha,
            "manifestBytes": expected_bytes,
            "sourceMember": entry.get("sourceMember"),
        }

    archive_info: dict[str, Any] = {
        "checked": source_archive is not None,
        "path": str(source_archive) if source_archive else None,
        "sha256": None,
        "memberChecks": 0,
    }
    if source_archive is not None:
        if not source_archive.exists():
            add_problem(problems, f"source archive missing: {source_archive}")
        else:
            archive_raw_sha = sha256_bytes(source_archive.read_bytes())
            archive_info["sha256"] = archive_raw_sha
            if archive_raw_sha != manifest.get("sourceArchiveSha256"):
                add_problem(problems, f"source archive sha256 mismatch: actual={archive_raw_sha} manifest={manifest.get('sourceArchiveSha256')}")
            try:
                with zipfile.ZipFile(source_archive) as zf:
                    names = Counter(zf.namelist())
                    for dest in EXPECTED_TRACKS:
                        entry = by_dest.get(dest)
                        if entry is None:
                            continue
                        member = entry.get("sourceMember")
                        if not isinstance(member, str) or names[member] != 1:
                            add_problem(problems, f"source archive member must exist exactly once: {member!r}")
                            continue
                        member_raw = zf.read(member)
                        member_sha = sha256_bytes(member_raw)
                        if member_sha != entry.get("sha256"):
                            add_problem(problems, f"source archive member sha mismatch: {dest}: member={member_sha} manifest={entry.get('sha256')}")
                        if len(member_raw) != entry.get("bytes"):
                            add_problem(problems, f"source archive member byte size mismatch: {dest}")
                        archive_info["memberChecks"] += 1
            except zipfile.BadZipFile as exc:
                add_problem(problems, f"source archive invalid ZIP: {exc}")

    return by_dest, {
        "status": "PASS" if not problems else "CHECK",
        "path": str(manifest_path.relative_to(repo_root)).replace("\\", "/"),
        "sourceArchiveSha256": manifest.get("sourceArchiveSha256"),
        "sourceHashes": source_hashes,
        "archive": archive_info,
    }


def validate(repo_root: Path, source_archive: Path | None = None) -> dict[str, Any]:
    repo_root = repo_root.resolve()
    grammar_root = repo_root / "modules" / "GrammarV1"
    exercise_dir = grammar_root / "source" / "exercises"
    schema_path = grammar_root / "schema" / "grammar-exercise.schema.json"
    problems: list[str] = []
    warnings: list[dict[str, Any]] = []

    if not schema_path.exists():
        add_problem(problems, f"missing schema: {schema_path}")
        schema: dict[str, Any] = {}
    else:
        try:
            schema = load_json(schema_path)
        except Exception as exc:
            add_problem(problems, f"schema parse failed: {exc}")
            schema = {}

    if schema:
        if schema.get("$id") != "urn:tieng-trung:GrammarV1:grammar-exercise-source:v1":
            add_problem(problems, f"schema $id unexpected: {schema.get('$id')!r}")
        contract = schema.get("x-grammarV1Contract")
        if not isinstance(contract, dict) or contract.get("contractVersion") != "grammar-exercise-source-v1":
            add_problem(problems, "schema x-grammarV1Contract.contractVersion mismatch")
        if contract.get("canonicalLocation") != "modules/GrammarV1/source/exercises/":
            add_problem(problems, "schema canonicalLocation mismatch")
    defs = schema.get("$defs", {}) if isinstance(schema, dict) else {}
    required_defs = {"grammarId", "nonEmptyString", "mcq", "translateZhVi", "translateViZh"}
    if not required_defs.issubset(set(defs)):
        add_problem(problems, f"schema missing required defs: {sorted(required_defs - set(defs))}")

    manifest_entries, provenance = validate_manifest(
        repo_root, exercise_dir, schema, source_archive, problems
    ) if schema else ({}, {})

    if exercise_dir.exists():
        actual_json_files = {p.name for p in exercise_dir.glob("*.json") if p.is_file()}
        expected_json_files = set(EXPECTED_TRACKS) | {"source-manifest.json"}
        if actual_json_files != expected_json_files:
            add_problem(problems, f"exercise source file set mismatch: actual={sorted(actual_json_files)} expected={sorted(expected_json_files)}")
    else:
        add_problem(problems, f"missing exercise directory: {exercise_dir}")

    canonical_grammar_ids, grammar_details = load_canonical_grammar_ids(repo_root, problems)

    all_question_ids: list[str] = []
    all_grammar_ids: set[str] = set()
    type_totals: Counter[str] = Counter()
    track_reports: dict[str, Any] = {}
    per_grammar: dict[str, Counter[str]] = defaultdict(Counter)
    per_grammar_seq: dict[str, list[int]] = defaultdict(list)

    for file_name in EXPECTED_TRACKS:
        path = exercise_dir / file_name
        label = TRACK_LABELS[file_name]
        if not path.exists():
            continue
        try:
            data = load_json(path)
        except Exception as exc:
            add_problem(problems, f"{file_name}: JSON parse failed: {exc}")
            continue
        if not isinstance(data, list) or len(data) == 0:
            add_problem(problems, f"{file_name}: top-level must be non-empty array")
            continue

        qids: list[str] = []
        gids: list[str] = []
        track_types: Counter[str] = Counter()
        track_warnings: list[str] = []
        for index, record in enumerate(data):
            if defs:
                structural_validate_record(
                    record,
                    file_name=file_name,
                    index=index,
                    defs=defs,
                    problems=problems,
                )
            if not isinstance(record, dict):
                continue
            qid = record.get("questionId")
            gid = record.get("grammarId")
            typ = record.get("type")
            seq = record.get("seq")
            if isinstance(qid, str):
                qids.append(qid)
                all_question_ids.append(qid)
            if isinstance(gid, str):
                gids.append(gid)
                all_grammar_ids.add(gid)
            if isinstance(typ, str):
                track_types[typ] += 1
                type_totals[typ] += 1
            if isinstance(gid, str) and isinstance(typ, str):
                per_grammar[gid][typ] += 1
            if isinstance(gid, str) and is_int_not_bool(seq):
                per_grammar_seq[gid].append(seq)

            expected_qid = expected_question_id(record)
            if expected_qid is not None and qid != expected_qid:
                add_problem(problems, f"{file_name}[{index}]: questionId={qid!r} expected={expected_qid!r} from grammarId/type/seq")

            if typ == "mcq" and isinstance(record.get("options"), list):
                options = record["options"]
                ids = [o.get("id") for o in options if isinstance(o, dict)]
                answer = record.get("answer")
                if answer not in ids:
                    add_problem(problems, f"{file_name}[{index}]: answer={answer!r} does not reference existing option id")
                texts = [o.get("text") for o in options if isinstance(o, dict) and isinstance(o.get("text"), str)]
                duplicates = sorted({t for t, c in Counter(texts).items() if c > 1})
                if duplicates:
                    warnings.append({
                        "code": "DUPLICATE_OPTION_TEXT",
                        "severity": "WARN",
                        "questionId": qid,
                        "file": file_name,
                        "duplicateTexts": duplicates,
                    })
                    track_warnings.append(str(qid))

        if len(qids) != len(set(qids)):
            dup = sorted(q for q, c in Counter(qids).items() if c > 1)
            add_problem(problems, f"{file_name}: duplicate questionId inside track: {dup[:10]}")

        exercise_gid_set = set(gids)
        grammar_gid_set = canonical_grammar_ids.get(file_name, set())
        unresolved = sorted(exercise_gid_set - grammar_gid_set)
        missing_exercises_for_grammar = sorted(grammar_gid_set - exercise_gid_set)
        if unresolved:
            add_problem(problems, f"{file_name}: grammarId does not resolve to canonical grammar: {unresolved[:10]} total={len(unresolved)}")
        if missing_exercises_for_grammar:
            add_problem(problems, f"{file_name}: canonical grammar IDs without exercises: {missing_exercises_for_grammar[:10]} total={len(missing_exercises_for_grammar)}")

        track_reports[label] = {
            "file": file_name,
            "records": len(data),
            "questionIdsUnique": len(set(qids)),
            "grammarIds": len(exercise_gid_set),
            "canonicalGrammarIds": len(grammar_gid_set),
            "types": dict(sorted(track_types.items())),
            "warningQuestionIds": track_warnings,
        }

    duplicate_global = sorted(q for q, c in Counter(all_question_ids).items() if c > 1)
    if duplicate_global:
        add_problem(problems, f"global duplicate questionId: {duplicate_global[:20]} total={len(duplicate_global)}")

    contract = schema.get("x-grammarV1Contract", {}) if isinstance(schema, dict) else {}
    baseline = contract.get("auditedBaseline", {}) if isinstance(contract, dict) else {}
    cross = contract.get("crossRecordInvariants", {}) if isinstance(contract, dict) else {}
    expected_total = baseline.get("exercises", 7980)
    expected_grammar_total = baseline.get("grammarIds", 399)
    expected_types = baseline.get("types", {"mcq": 3990, "translate_zh_vi": 1995, "translate_vi_zh": 1995})
    expected_per_total = cross.get("perGrammarTotal", 20)
    expected_per_types = cross.get("perGrammarTypes", {"mcq": 10, "translate_zh_vi": 5, "translate_vi_zh": 5})
    expected_seq = cross.get("perGrammarSeq", list(range(1, 21)))

    if len(all_question_ids) != expected_total:
        add_problem(problems, f"exercise total={len(all_question_ids)} expected={expected_total}")
    if len(set(all_question_ids)) != expected_total:
        add_problem(problems, f"unique questionId={len(set(all_question_ids))} expected={expected_total}")
    if len(all_grammar_ids) != expected_grammar_total:
        add_problem(problems, f"unique grammarId={len(all_grammar_ids)} expected={expected_grammar_total}")
    if dict(type_totals) != expected_types:
        add_problem(problems, f"type totals={dict(type_totals)} expected={expected_types}")

    bad_distribution: list[dict[str, Any]] = []
    for gid in sorted(all_grammar_ids):
        counts = per_grammar.get(gid, Counter())
        seqs = sorted(per_grammar_seq.get(gid, []))
        ok_types = all(counts.get(k, 0) == v for k, v in expected_per_types.items())
        ok_total = sum(counts.values()) == expected_per_total
        ok_seq = seqs == expected_seq
        if not (ok_types and ok_total and ok_seq):
            bad_distribution.append({"grammarId": gid, "types": dict(counts), "total": sum(counts.values()), "seq": seqs})
    if bad_distribution:
        add_problem(problems, f"per-grammar distribution/seq invalid: total={len(bad_distribution)} sample={bad_distribution[:3]}")

    known_warning_ids = set(baseline.get("knownDuplicateOptionTextQuestionIds", []))
    actual_warning_ids = {w.get("questionId") for w in warnings if w.get("code") == "DUPLICATE_OPTION_TEXT"}
    warning_baseline = {
        "knownQuestionIds": sorted(known_warning_ids),
        "actualQuestionIds": sorted(actual_warning_ids),
        "matchesAuditedBaseline": actual_warning_ids == known_warning_ids,
    }

    report = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "status": "PASS" if not problems else "FAIL",
        "contractVersion": contract.get("contractVersion") if isinstance(contract, dict) else None,
        "repoRoot": str(repo_root),
        "schema": {
            "path": str(schema_path.relative_to(repo_root)).replace("\\", "/") if schema_path.exists() else str(schema_path),
            "sha256": sha256_bytes(schema_path.read_bytes()) if schema_path.exists() else None,
        },
        "totals": {
            "tracks": len(track_reports),
            "exercises": len(all_question_ids),
            "questionIdsUnique": len(set(all_question_ids)),
            "grammarIds": len(all_grammar_ids),
            "types": dict(sorted(type_totals.items())),
        },
        "canonicalGrammar": {
            "tracks": grammar_details,
            "resolvedGrammarIds": sum(len(x) for x in canonical_grammar_ids.values()),
        },
        "tracks": track_reports,
        "provenance": provenance,
        "warningBaseline": warning_baseline,
        "warnings": warnings,
        "problems": problems,
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate GrammarV1 canonical exercise source against the locked G1 contract.")
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--source-archive", type=Path, default=None, help="Optional original XieHanzi ZIP for full provenance verification.")
    parser.add_argument("--report", type=Path, default=None, help="Optional UTF-8 JSON report path.")
    args = parser.parse_args()

    try:
        report = validate(args.repo_root, args.source_archive)
    except Exception as exc:
        report = {
            "schemaVersion": REPORT_SCHEMA_VERSION,
            "status": "FAIL",
            "warnings": [],
            "problems": [f"internal validator error: {type(exc).__name__}: {exc}"],
        }

    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Console output remains ASCII-safe for Windows PowerShell 5.1.
    summary = {
        "status": report.get("status"),
        "totals": report.get("totals"),
        "warnings": len(report.get("warnings", [])),
        "problems": len(report.get("problems", [])),
    }
    print(json.dumps(summary, ensure_ascii=True, indent=2))
    return 0 if report.get("status") == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
