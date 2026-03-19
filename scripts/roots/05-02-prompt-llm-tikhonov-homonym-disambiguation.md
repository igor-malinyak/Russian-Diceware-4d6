# Step 05: LLM Tikhonov Homonym Disambiguation

## Goal
Resolve cases where the lemma is already aligned to a Kuznetsova homonym family, but the exact homonym `root` variant still has to be chosen.

This step outputs exact `root` values, not `canonical_root`.

## Input Files
- `data/roots/llm-tikhonov-homonym-disambiguation.original.csv`
- `data/roots/kuznetsova-roots.csv`

These helper scripts are also part of the task context:
- `scripts/roots/05-03-split-llm-tikhonov-homonym-disambiguation.ts`
- `scripts/roots/05-04-merge-llm-tikhonov-homonym-disambiguation.ts`

## Output Files
- chunk files: `data/roots/llm-tikhonov-homonym-disambiguation.chunks/llm-tikhonov-homonym-disambiguation.chunk-XXX.llm.csv`
- merged file: `data/roots/llm-tikhonov-homonym-disambiguation.llm.csv`

## Allowed Changes
Fill only:
- `roots`

Do not change:
- `Number`
- `Lemma`
- `PoS`
- `tikhonov_roots_raw`
- `deterministic_roots`
- `kuznetsova_homonym_candidates`
- row order
- row count

## Row Structure
Each row is a lemma-level task.

Important:
- one lemma may have one root or multiple roots
- some roots may already be fully determined
- only the unresolved homonymous roots need to be chosen on this step

Use the columns like this:
- `Lemma` — the lemma whose roots must be finalized
- `PoS` — part of speech; use it as additional semantic context
- `tikhonov_roots_raw` — the raw Tikhonov roots for this lemma
- `deterministic_roots` — roots that are already determined and must stay in the final answer
- `kuznetsova_homonym_candidates` — unresolved positions that need a choice among homonymous Kuznetsova roots

The `kuznetsova_homonym_candidates` field is formatted as one or more items like:
- `rawRoot => candidate1|candidate2|candidate3`

If there are multiple unresolved positions, they are separated by `; `.

## Required Workflow
1. Start from `data/roots/llm-tikhonov-homonym-disambiguation.original.csv`.
2. Use `scripts/roots/05-03-split-llm-tikhonov-homonym-disambiguation.ts` to split it into chunk pairs under `data/roots/llm-tikhonov-homonym-disambiguation.chunks`.
3. Process every generated chunk `.original.csv`.
4. If your environment supports worker subagents, you must use them: assign exactly one worker subagent to each chunk `.original.csv`.
5. Each worker subagent must read only:
   - its assigned chunk `.original.csv`
   - `data/roots/kuznetsova-roots.csv`
6. Each worker subagent must write only the matching chunk `.llm.csv` for its own chunk.
7. The top-level agent must pass each worker subagent the existing sections `## Allowed Changes`, `## Row Structure`, `## Execution Discipline`, `## Using data/roots/kuznetsova-roots.csv`, `## How To Solve Each Chunk`, `## Important Rules`, and `## Worker Subagent Contract` verbatim.
8. The top-level agent is responsible only for orchestration:
   - split the source file
   - assign one chunk per worker subagent
   - ensure every chunk is completed
   - merge the finished chunk `.llm.csv` files
9. If the environment limits concurrent worker subagents, process chunks in batches, but still keep exactly one worker subagent per chunk.
10. After all chunks are filled, use `scripts/roots/05-04-merge-llm-tikhonov-homonym-disambiguation.ts` to assemble `data/roots/llm-tikhonov-homonym-disambiguation.llm.csv`.

## Execution Discipline
- Follow the chunk workflow exactly: split, process every chunk, then merge.
- This task is valid only if every row of every chunk is individually reviewed.
- Do not bypass this LLM step with heuristics, scripts, shortcut mappings, override tables, prefill passes, or ad hoc simplifications.
- Do not create helper scripts, generators, transformations, or patching utilities that write `roots`.
- Do not decide that some rows or chunks can be auto-filled without actually applying this prompt to them row by row.
- Do not prefill rows from `deterministic_roots` plus a guessed homonym and patch exceptions later.
- Do not perform dataset-wide scouting passes whose goal is to derive bulk rules, exception lists, fallback defaults, or root-number selection heuristics.
- Do not derive or apply global heuristics from `root_base`, homonym numbering patterns, string overlap, part-of-speech frequency, or similar cross-dataset patterns.
- Any supporting analysis must stay local to the current chunk and the current row being decided.
- Do not invent any extra decision rules, thresholds, fallback heuristics, or pipeline rules beyond what is explicitly stated in this prompt.
- If you cannot honestly complete a chunk by row-by-row semantic review, stop and report that chunk as incomplete instead of approximating.

## Using `data/roots/kuznetsova-roots.csv`
Use `data/roots/kuznetsova-roots.csv` as the semantic reference for candidate roots.

Relevant fields there are:
- `root` — the exact Kuznetsova root candidate
- `root_base` — the same root without a homonym number
- `examples` — example lemmas for that root

When choosing between homonymous candidates:
- look up each candidate root in `data/roots/kuznetsova-roots.csv`
- inspect the `examples` field for each candidate
- use those example lemmas as the main semantic evidence for what that homonymous root means
- choose the candidate whose examples best match the meaning of the target lemma

## How To Solve Each Chunk
1. Read one chunk `.original.csv`.
2. For each row, read the lemma, its part of speech, and the already known `deterministic_roots`.
3. Treat `deterministic_roots` as fixed: they already belong to the lemma and do not need disambiguation.
4. For each item in `kuznetsova_homonym_candidates`, choose exactly one candidate `root`.
5. Use `data/roots/kuznetsova-roots.csv` to inspect the candidate roots:
   - compare their meanings through the `examples` field
   - choose by semantic fit to the lemma, not by string similarity alone
6. If multiple candidate roots share the same base but differ by homonym number, choose the numbered `root` whose meaning matches the lemma.
7. Fill `roots` with the full final comma-separated list of roots for the lemma:
   - include all `deterministic_roots`
   - add one chosen root for each unresolved homonym position

## Important Rules
- Output exact `root` values from the Kuznetsova system.
- Do not output `canonical_root` here.
- Keep already known deterministic roots in the final list.
- If multiple roots belong to the lemma, include all of them in the final `roots` field.
- Use the `examples` field from `data/roots/kuznetsova-roots.csv` as the main semantic evidence for candidate roots.
- Do not invent new roots on this step.
- Do not use `root_base`, homonym numbering, or string similarity as a shortcut for semantic review.
- Do not introduce new rules or hidden heuristics beyond the ones stated above.

## Worker Subagent Contract
- One worker subagent owns exactly one chunk.
- A worker subagent must not edit any other chunk, any helper script, or any shared prompt file.
- A worker subagent must not create helper scripts, temporary generators, override files, or bulk-edit artifacts.
- A worker subagent must not perform dataset-wide meta-analysis outside its assigned chunk.
- The top-level agent may coordinate many worker subagents in parallel, but each chunk must still be solved by row-by-row semantic review.
- The top-level agent must not give the worker a shortened or weakened version of the required sections from this prompt.
- The top-level agent must reject and redo any chunk whose worker instructions omitted required constraints from this prompt.
