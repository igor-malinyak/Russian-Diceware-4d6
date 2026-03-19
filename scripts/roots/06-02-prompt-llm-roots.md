# Step 06: LLM Residual Roots

## Goal
Resolve the lemma-level cases listed in the input file.

This step outputs `root` values, not `canonical_root`.

## Input Files
- `data/roots/llm-roots.original.csv`
- `data/roots/resolved-roots.csv`

These helper scripts are also part of the task context:
- `scripts/roots/06-03-split-llm-roots.ts`
- `scripts/roots/06-04-merge-llm-roots.ts`

## Output Files
- chunk files: `data/roots/llm-roots.chunks/llm-roots.chunk-XXX.llm.csv`
- merged file: `data/roots/llm-roots.llm.csv`

## Reference File Structure
`data/roots/resolved-roots.csv` contains these fields:
- `root` — the exact root form that should be written to output
- `root_base` — the same root without a homonym number suffix
- `canonical_root` — final normalized form used later in the pipeline
- `source` — where this root came from
- `examples` — representative lemmas for this root

Use this file as follows:
- use `root` as the actual candidate value for output
- use `examples` to understand the meaning and lexical family of the root
- use `root_base` to detect homonymous variants of the same root family
- if several candidates share the same `root_base` but differ by number, choose the exact numbered `root` whose meaning matches the lemma

## Allowed Changes
Fill only:
- `roots`

Do not change:
- `Number`
- `Lemma`
- `PoS`
- `reason`
- `tikhonov_roots_raw`
- `deterministic_roots`
- `kuznetsova_homonym_candidates`
- `notes`
- row order
- row count

## Row Structure
Each row is a residual lemma-level task.

Use the columns like this:
- `Lemma` — the lemma whose root or roots must be determined
- `PoS` — part of speech; use it as semantic context and as a check against implausible candidates
- `reason` — why the lemma reached this residual step
- `tikhonov_roots_raw` — raw Tikhonov roots for this lemma, if Tikhonov has the lemma
- `deterministic_roots` — roots that are already fixed and must stay in the final answer
- `kuznetsova_homonym_candidates` — unresolved homonymous positions that need a choice among numbered Kuznetsova roots
- `notes` — technical explanation of what remained unresolved before this step

Interpret `reason` like this:
- `missing_in_both` — the lemma is absent from both Kuznetsova and Tikhonov, so solve it from the lemma itself and the existing resolved roots
- `lemma_level_conflict` — the lemma reached this step because root-level evidence was conflicting or could not support one consistent root choice
- `residual_after_root_mapping` — the lemma still remained unresolved after earlier automatic and root-level stages

Use `tikhonov_roots_raw` like this:
- if it is non-empty, treat it as supporting evidence about possible root structure
- do not copy it mechanically into `roots`
- if it conflicts with lemma meaning or with stronger evidence from `resolved-roots.csv`, prefer the semantically correct solution

Use `deterministic_roots` like this:
- treat them as already fixed
- keep them in the final `roots` field
- do not re-decide them on this step

Use `kuznetsova_homonym_candidates` like this:
- treat each item as an unresolved position of the form `rawRoot => candidate1|candidate2|candidate3`
- use `resolved-roots.csv` to inspect the candidate roots
- use the `examples` field there as the main semantic evidence for choosing the exact numbered `root`
- if the row contains both homonym candidates and other unresolved evidence, solve the whole lemma in one pass

Use `notes` like this:
- treat it as diagnostic context explaining why earlier stages failed
- use it to understand whether the problem is missing coverage, unresolved mapping, or conflicting evidence
- do not treat it as a decision rule by itself

## Required Workflow
1. Start from `data/roots/llm-roots.original.csv`.
2. Use `scripts/roots/06-03-split-llm-roots.ts` to split it into chunk pairs under `data/roots/llm-roots.chunks`.
3. Process every generated chunk `.original.csv`.
4. If your environment supports worker subagents, you must use them: assign exactly one worker subagent to each chunk `.original.csv`.
5. Each worker subagent must read only:
   - its assigned chunk `.original.csv`
   - `data/roots/resolved-roots.csv`
6. Each worker subagent must write only the matching chunk `.llm.csv` for its own chunk.
7. The top-level agent must pass each worker subagent the existing sections `## Allowed Changes`, `## Row Structure`, `## Execution Discipline`, `## How To Solve Each Chunk`, `## Important Rules`, and `## Worker Subagent Contract` verbatim.
8. The top-level agent is responsible only for orchestration:
   - split the source file
   - assign one chunk per worker subagent
   - ensure every chunk is completed
   - merge the finished chunk `.llm.csv` files
9. If the environment limits concurrent worker subagents, process chunks in batches, but still keep exactly one worker subagent per chunk.
10. After all chunks are filled, use `scripts/roots/06-04-merge-llm-roots.ts` to assemble `data/roots/llm-roots.llm.csv`.

## Execution Discipline
- Follow the chunk workflow exactly: split, process every chunk, then merge.
- This task is valid only if every row of every chunk is individually reviewed.
- Do not bypass this LLM step with heuristics, scripts, shortcut mappings, override tables, prefill passes, or ad hoc simplifications.
- Do not create helper scripts, generators, transformations, or patching utilities that write `roots`.
- Do not decide that some rows or chunks can be auto-filled without actually applying this prompt to them row by row.
- Do not prefill rows from `deterministic_roots`, `kuznetsova_homonym_candidates`, or `tikhonov_roots_raw` and patch exceptions later.
- Do not perform dataset-wide scouting passes whose goal is to derive bulk rules, exception lists, fallback defaults, or broad root-matching heuristics.
- Do not derive or apply global heuristics from string overlap, `root_base`, part of speech, root count, note text patterns, or similar cross-dataset signals.
- Any supporting analysis must stay local to the current chunk and the current row being decided.
- Do not invent any extra decision rules, thresholds, fallback heuristics, or pipeline rules beyond what is explicitly stated in this prompt.
- If you cannot honestly complete a chunk by row-by-row semantic review, stop and report that chunk as incomplete instead of approximating.

## How To Solve Each Chunk
1. Read one chunk `.original.csv`.
2. For each row, read `Lemma`, `PoS`, `reason`, `tikhonov_roots_raw`, `deterministic_roots`, `kuznetsova_homonym_candidates`, and `notes`.
3. Decide whether the lemma likely has one root or multiple roots.
4. Inspect `resolved-roots.csv` for semantically appropriate candidate roots.
5. Use `examples` in `resolved-roots.csv` as the main semantic evidence for candidate roots.
6. If `reason = lemma_level_conflict`, treat the row as a lemma-level conflict: the correct root must be chosen from lemma meaning, not from earlier conflicting root-level evidence.
7. If `tikhonov_roots_raw` is present, use it only as supporting evidence about likely root structure.
8. Keep all `deterministic_roots` in the final answer.
9. For each item in `kuznetsova_homonym_candidates`, choose exactly one numbered `root` by meaning.
10. If the lemma also needs additional non-homonym roots, match them against existing roots in `resolved-roots.csv` when possible.
11. If no existing root is appropriate for an unresolved part, introduce a new `root`.
12. Fill `roots` with the full final comma-separated list of `root` values for the lemma.

## Important Rules
- Output `root`, not `canonical_root`.
- Match roots by meaning and lexical family, not by superficial string similarity alone.
- Use `PoS`, `tikhonov_roots_raw`, and `notes` only as supporting evidence, not as mechanical rules.
- Use the `examples` field from `resolved-roots.csv` as the main semantic evidence for existing roots.
- Use the exact numbered `root` when the appropriate existing root is homonymous.
- Keep `deterministic_roots` in the final result.
- If you create a new root, do not try to canonicalize it separately on this step.
- If the lemma has multiple roots, include all of them.
- Prefer an existing root when the mapping is convincing.
- Prefer a new root over a weak or forced mapping.
- Do not introduce new rules or hidden heuristics beyond the ones stated above.

## Worker Subagent Contract
- One worker subagent owns exactly one chunk.
- A worker subagent must not edit any other chunk, any helper script, or any shared prompt file.
- A worker subagent must not create helper scripts, temporary generators, override files, or bulk-edit artifacts.
- A worker subagent must not perform dataset-wide meta-analysis outside its assigned chunk.
- The top-level agent may coordinate many worker subagents in parallel, but each chunk must still be solved by row-by-row semantic review.
- The top-level agent must not give the worker a shortened or weakened version of the required sections from this prompt.
- The top-level agent must reject and redo any chunk whose worker instructions omitted required constraints from this prompt.
