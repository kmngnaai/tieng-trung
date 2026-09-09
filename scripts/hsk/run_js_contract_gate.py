#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

KNOWN_BASELINE_DEBT = {
    "test_listening_mobile_controls_contract.js",
    "test_listening_shuffle_order_contract.js",
    "test_mobile_practice_shell_contract.js",
    "test_pinyin_refactor_contract.js",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", type=Path, default=Path("."))
    ap.add_argument("--report", type=Path, required=True)
    ap.add_argument("--log", type=Path, required=True)
    ap.add_argument("--min-tests", type=int, default=42)
    args = ap.parse_args()

    repo = args.repo_root.resolve()
    tests_dir = repo / "tests"
    node = shutil.which("node")
    blockers: list[dict] = []
    if not node:
        blockers.append({"code": "NODE_NOT_FOUND"})
        tests = []
    else:
        tests = sorted(tests_dir.glob("test_*.js"), key=lambda p: p.name)

    results = []
    args.log.parent.mkdir(parents=True, exist_ok=True)
    with args.log.open("w", encoding="utf-8", newline="\n") as log:
        for test in tests:
            proc = subprocess.run(
                [node, str(test)],
                cwd=repo,
                text=True,
                encoding="utf-8",
                errors="replace",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            log.write(f"\n===== {test.name} exit={proc.returncode} =====\n")
            log.write("=== STDOUT ===\n")
            log.write(proc.stdout or "")
            if proc.stdout and not proc.stdout.endswith("\n"):
                log.write("\n")
            log.write("=== STDERR ===\n")
            log.write(proc.stderr or "")
            if proc.stderr and not proc.stderr.endswith("\n"):
                log.write("\n")
            results.append({"name": test.name, "exitCode": proc.returncode})

    failures = [row["name"] for row in results if row["exitCode"] != 0]
    new_failures = [name for name in failures if name not in KNOWN_BASELINE_DEBT]
    known_failures = [name for name in failures if name in KNOWN_BASELINE_DEBT]
    resolved_known = sorted(KNOWN_BASELINE_DEBT - set(failures))

    if len(tests) < args.min_tests:
        blockers.append({
            "code": "JS_TEST_COUNT_BELOW_BASELINE",
            "expectedAtLeast": args.min_tests,
            "actual": len(tests),
        })
    if new_failures:
        blockers.append({
            "code": "NEW_JS_FAILURES",
            "count": len(new_failures),
            "tests": new_failures,
        })

    report = {
        "schemaVersion": "phase-b2-js-no-new-regression-v1",
        "status": "PASS" if not blockers else "BLOCKED",
        "node": node or "",
        "testsRan": len(tests),
        "knownBaselineDebt": sorted(KNOWN_BASELINE_DEBT),
        "failures": failures,
        "knownDebtStillFailing": known_failures,
        "knownDebtResolved": resolved_known,
        "newFailures": new_failures,
        "blockers": blockers,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
