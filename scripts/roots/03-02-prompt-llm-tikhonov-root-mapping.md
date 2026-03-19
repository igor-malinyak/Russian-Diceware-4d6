# Step 03: LLM Tikhonov Root Mapping

## Goal
For each `tikhonov_root`, decide whether it:
- maps to one existing Kuznetsova `root`
- should be introduced as a new `root`
- or cannot be resolved on the root level because its lemmas point in different semantic directions

This is a root-level task. Do not output `canonical_root` here.

## Input Files
- `data/roots/llm-tikhonov-root-mapping.original.csv`
- `data/roots/kuznetsova-roots.csv`

These helper scripts are also part of the task context:
- `scripts/roots/03-03-split-llm-tikhonov-root-mapping.ts`
- `scripts/roots/03-04-merge-llm-tikhonov-root-mapping.ts`

## Output Files
- chunk files: `data/roots/llm-tikhonov-root-mapping.chunks/llm-tikhonov-root-mapping.chunk-XXX.llm.csv`
- merged file: `data/roots/llm-tikhonov-root-mapping.llm.csv`

## Allowed Changes
Fill only:
- `decision`
- `root`

Do not change:
- `tikhonov_root`
- `lemmas`
- row order
- row count

## Decision Values
- `mapped`
- `new_root`
- `lemma_level_conflict`

## Required Workflow
1. Start from `data/roots/llm-tikhonov-root-mapping.original.csv`.
2. Use `scripts/roots/03-03-split-llm-tikhonov-root-mapping.ts` to split it into chunk pairs under `data/roots/llm-tikhonov-root-mapping.chunks`.
3. Process every generated chunk `.original.csv`.
4. If your environment supports worker subagents, you must use them: assign exactly one worker subagent to each chunk `.original.csv`.
5. Each worker subagent must read only:
   - its assigned chunk `.original.csv`
   - `data/roots/kuznetsova-roots.csv`
6. Each worker subagent must write only the matching chunk `.llm.csv` for its own chunk.
7. The top-level agent must pass each worker subagent the existing sections `## Allowed Changes`, `## Decision Values`, `## Execution Discipline`, `## How To Solve Each Chunk`, `## Important Rules`, and `## Worker Subagent Contract` verbatim.
8. The top-level agent is responsible only for orchestration:
   - split the source file
   - assign one chunk per worker subagent
   - ensure every chunk is completed
   - merge the finished chunk `.llm.csv` files
9. If the environment limits concurrent worker subagents, process chunks in batches, but still keep exactly one worker subagent per chunk.
10. After all chunks are filled, use `scripts/roots/03-04-merge-llm-tikhonov-root-mapping.ts` to assemble `data/roots/llm-tikhonov-root-mapping.llm.csv`.

## Execution Discipline
- Follow the chunk workflow exactly: split, process every chunk, then merge.
- This task is valid only if every row of every chunk is individually reviewed.
- Do not bypass this LLM step with heuristics, scripts, shortcut mappings, override tables, prefill passes, or ad hoc simplifications.
- Do not create helper scripts, generators, transformations, or patching utilities that write `decision` or `root`.
- Do not decide that some rows or chunks can be auto-filled without actually applying this prompt to them row by row.
- Do not prefill rows with a default such as `new_root = tikhonov_root` and patch exceptions later.
- Do not perform dataset-wide scouting passes whose goal is to derive bulk rules, exception lists, or fallback defaults.
- Do not derive or apply global heuristics from exact string overlap, substring overlap, prefix/suffix shape, lemma count, or similar patterns across the dataset.
- Any supporting analysis must stay local to the current chunk and the current row being decided.
- Do not invent any extra decision rules, thresholds, fallback heuristics, or pipeline rules beyond what is explicitly stated in this prompt.
- If you cannot honestly complete a chunk by row-by-row semantic review, stop and report that chunk as incomplete instead of approximating.

## How To Solve Each Chunk
1. Read one chunk `.original.csv`.
2. For each row in that chunk, treat `tikhonov_root` as the object of analysis.
3. Use `lemmas` as the main evidence. This field contains the known Tikhonov lemmas for that root.
4. Compare those lemmas semantically against `data/roots/kuznetsova-roots.csv`.
5. Decide that specific row only after reading that row and performing that comparison.
6. Then choose exactly one outcome:
   - `mapped` if the lemmas support one existing Kuznetsova `root`
   - `new_root` if they support a new root that does not exist in the Kuznetsova system
   - `lemma_level_conflict` if different lemmas clearly point to different roots and no single root-level decision is reliable
7. Write the result into the matching chunk `.llm.csv`.

## Important Rules
- Work on the level of `root`, not `canonical_root`.
- Use `lemmas` as the primary evidence.
- Use the `examples` field in `data/roots/kuznetsova-roots.csv` as the main evidence for an existing Kuznetsova root.
- Match by meaning and lexical family, not by superficial string similarity alone.
- If the lemmas do not support one consistent root-level decision, use `lemma_level_conflict`.
- When `decision = lemma_level_conflict`, leave `root` empty.
- If you are unsure between a weak mapping and a truly new root, prefer `new_root` for that analyzed row only.
- The rule above is not a license for dataset-level defaults, mass prefill, or chunk-level bulk decisions.
- `mapped` must point to one existing exact Kuznetsova `root` from `data/roots/kuznetsova-roots.csv`.
- `new_root` must fill `root` with the new exact root you are introducing for that row.
- Only `lemma_level_conflict` may leave `root` empty.
- Do not invent or alter homonym numbering for existing Kuznetsova roots.
- Do not try to canonicalize new roots.
- Do not introduce new rules or hidden heuristics beyond the ones stated above.
- Preserve all non-LLM fields exactly.

## Worker Subagent Contract
- One worker subagent owns exactly one chunk.
- A worker subagent must not edit any other chunk, any helper script, or any shared prompt file.
- A worker subagent must not create helper scripts, temporary generators, override files, or bulk-edit artifacts.
- A worker subagent must not perform dataset-wide meta-analysis outside its assigned chunk.
- The top-level agent may coordinate many worker subagents in parallel, but each chunk must still be solved by row-by-row semantic review.
- The top-level agent must not give the worker a shortened or weakened version of the required sections from this prompt.
- The top-level agent must reject and redo any chunk whose worker instructions omitted required constraints from this prompt.
