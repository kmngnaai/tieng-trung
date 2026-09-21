# GrammarV1

GrammarV1 is the dedicated grammar-practice subsystem.

## Source contract

- Existing repository grammar definitions remain canonical and are NOT duplicated here.
- `source/exercises/` contains the canonical imported XieHanzi grammar exercise records.
- Exercise linkage uses stable `grammarId` and `questionId`.
- UI state/progress and generated runtime projections must not be written into canonical source files.
- Canonical JSON bytes are protected by the scoped `source/exercises/.gitattributes` contract.
- Generated outputs belong under `_generated/GrammarV1/` starting in G2.

## Current milestone

G1 includes the seven byte-preserved exercise track files, provenance manifest, schema contract, production validator, and repository regression tests.
Runtime projection, shared adapter, and UI integration are intentionally deferred to G2 and later phases.
