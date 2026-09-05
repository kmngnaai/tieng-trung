import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT_SCRIPT = ROOT / "scripts/new-hsk-course/audit_hsk_taxonomy.py"
FIRST = ROOT / "modules/new-hsk-course/data/first-occurrence.json"
OFFICIAL = ROOT / "modules/new-hsk-course/source/official-vocabulary.json"


def load_module():
    spec = importlib.util.spec_from_file_location("audit_hsk_taxonomy", AUDIT_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_taxonomy_semantics_are_explicit_and_auditable():
    module = load_module()
    first = json.loads(FIRST.read_text(encoding="utf-8"))
    official = json.loads(OFFICIAL.read_text(encoding="utf-8"))
    report = module.build_report(first, official)

    official_entries = [row for rows in official["levels"].values() for row in rows]
    official_unique = {row["hanzi"] for row in official_entries}
    assert report["summary"]["officialReferenceEntries"] == len(official_entries)
    assert report["summary"]["officialReferenceUniqueHanzi"] == len(official_unique)
    assert report["summary"]["officialRepeatedEntriesBeyondFirst"] == len(official_entries) - len(official_unique)
    assert report["summary"]["officialHanziMissingFromFirstOccurrence"] == 0
    assert report["policy"]["differencesAreNotAutomaticallyErrors"] is True
    assert report["policy"]["lessonSourceRemainsAuthoritativeForCoursePlacement"] is True
    assert report["summary"]["lessonNewWordTerms"] > 0
    assert isinstance(report["findings"]["courseNewWordLevelDiffersFromOfficial"], list)
    repeated = {row["hanzi"]: row["entries"] for row in report["findings"]["officialRepeatedHanziEntries"]}
    assert len([entry for entry in repeated["得"] if entry["level"] == 3]) == 2

