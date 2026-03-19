[English](README.md) | [Русский](README.ru.md)

# Root Identification Pipeline

## Method
This pipeline assigns roots to lemmas from `data/dictionary-source.csv`.

It combines two root systems:
- Kuznetsova gives the main system of known roots and homonym distinctions.
- Tikhonov helps recover roots for lemmas that are missing from Kuznetsova.

The pipeline works in two levels:
- `root` is the concrete root used during matching and homonym disambiguation.
- `canonical_root` is the normalized final root used in the final dictionary.

For roots that exist in the Kuznetsova system:
- `canonical_root` is assigned by the Kuznetsova root grouping file.

For roots that do not exist in the Kuznetsova system:
- no separate canonicalization is attempted
- `canonical_root = root`

This means the final output always has a filled `canonical_root`, but only known Kuznetsova roots are canonicalized by the Kuznetsova grouping rules.

LLM is used only where automatic matching is not reliable enough:
- root-level mapping of Tikhonov roots to Kuznetsova roots
- homonym disambiguation
- residual lemma-level cases

The final artifact always writes `canonical_root` values into `dictionary-source-with-roots.csv`.

## Sources
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/roots/root_groups_fixed.txt`
- `data/external/train_Tikhonov_reformat.txt`

## Example Selection
When a root artifact stores example lemmas:
- examples are sorted by descending `IPM`
- top 10 examples are kept
- if a lemma is missing from `data/dictionary-source.csv`, its `IPM` is treated as `0`
- such lemmas are still eligible to appear in examples

## Steps

### 1. `01-build-kuznetsova-roots.ts`
Builds:
- `data/roots/kuznetsova-roots.csv`

Reads:
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/roots/root_groups_fixed.txt`

Produces a root registry for the Kuznetsova system with:
- `root`
- `root_base`
- `canonical_root`
- homonym metadata
- examples

This step is the only place where the mapping from Kuznetsova `root` to `canonical_root` is computed.

### 2. `02-build-tikhonov-auto-root-resolution.ts`
Builds:
- `data/roots/tikhonov-auto-root-resolution.csv`

Reads:
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/external/train_Tikhonov_reformat.txt`
- `data/roots/kuznetsova-roots.csv`

This step learns conservative automatic mappings from:
- `tikhonov_root`
to
- Kuznetsova `root`

Important:
- automatic learning uses only lemma pairs where:
  - Kuznetsova has exactly one unique `root` for the lemma
  - Tikhonov has exactly one `tikhonov_root` for the lemma
- Tikhonov lemmas with multiple roots do not participate in automatic candidate learning
- `auto_candidates` are `root` values, not `canonical_root`
- `resolved_canonical_root` is stored only as a lookup field for already resolved deterministic cases
- if one `tikhonov_root` accumulates conflicting Kuznetsova roots across different lemmas, that is treated as a lemma-level conflict, not as a root-mapping case

### 3. Root-level LLM mapping

#### 3.1. `03-01-build-llm-tikhonov-root-mapping.ts`
Builds:
- `data/roots/llm-tikhonov-root-mapping.original.csv`

This file contains only Tikhonov roots with zero automatic candidates.
It excludes roots with conflicting automatic evidence, which stay unresolved until lemma-level handling.
Each row includes all known Tikhonov lemmas for the given `tikhonov_root`.

#### 3.2. `03-02-prompt-llm-tikhonov-root-mapping.md`
Prompt instructions for the LLM step.

Important:
- the LLM fills `decision` and `root`
- this is a root-level task
- this task handles roots with no reliable automatic candidate and resolves them as `mapped`, `new_root`, or `lemma_level_conflict`
- the LLM may still conclude `lemma_level_conflict` if the lemmas do not support one consistent root-level decision
- this prompt explicitly covers split and merge workflow
- context file for LLM: `data/roots/kuznetsova-roots.csv`

#### 3.3. `03-03-split-llm-tikhonov-root-mapping.ts`
Required substep of the LLM workflow.

Splits:
- `data/roots/llm-tikhonov-root-mapping.original.csv`

Into chunk pairs under:
- `data/roots/llm-tikhonov-root-mapping.chunks`

#### 3.4. `03-04-merge-llm-tikhonov-root-mapping.ts`
Required substep of the LLM workflow.

Merges filled chunk `.llm.csv` files into:
- `data/roots/llm-tikhonov-root-mapping.llm.csv`

#### 3.5. `03-05-validate-llm-tikhonov-root-mapping.ts`
Optional validation helper.

Checks that the `.llm.csv` result:
- did not lose rows
- did not modify non-LLM fields
- filled required LLM columns

### 4. `04-build-resolved-roots.ts`
Builds:
- `data/roots/resolved-roots.csv`

Reads:
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/external/train_Tikhonov_reformat.txt`
- `data/roots/kuznetsova-roots.csv`
- `data/roots/llm-tikhonov-root-mapping.llm.csv`

This artifact contains roots that are already known after step 3 (root-level LLM mapping):
- all Kuznetsova roots
- all automatically resolved Tikhonov roots
- all new roots introduced by step 3

It does not include roots whose step 3 decision is `lemma_level_conflict`.

Fields include:
- `root`
- `root_base`
- `canonical_root`
- `source`
- `examples`

Rule:
- for known Kuznetsova roots, `canonical_root` comes from the Kuznetsova system
- for new roots, `canonical_root = root`
- examples are pooled across all known evidence for the same `root`:
  - Kuznetsova lemmas for that root
  - Tikhonov lemmas whose raw roots resolve to that root automatically
  - Tikhonov lemmas whose raw roots resolve to that root via step 3
  - then top 10 examples are selected by `IPM` with the usual `0` fallback

### 5. Homonym disambiguation

#### 5.1. `05-01-build-llm-tikhonov-homonym-disambiguation.ts`
Builds:
- `data/roots/llm-tikhonov-homonym-disambiguation.original.csv`

This step prepares lemma-level cases where the correct homonym `root` variant must be chosen.
It includes only pure homonym-disambiguation cases where all non-homonym roots are already resolved.

#### 5.2. `05-02-prompt-llm-tikhonov-homonym-disambiguation.md`
Prompt instructions for the LLM step.

Important:
- the LLM fills `roots`
- output must contain exact `root` values
- conversion to `canonical_root` happens later via `resolved-roots.csv`
- this prompt explicitly covers split and merge workflow
- context file for LLM: `data/roots/kuznetsova-roots.csv`

#### 5.3. `05-03-split-llm-tikhonov-homonym-disambiguation.ts`
Required substep of the LLM workflow.

Splits:
- `data/roots/llm-tikhonov-homonym-disambiguation.original.csv`

Into chunk pairs under:
- `data/roots/llm-tikhonov-homonym-disambiguation.chunks`

#### 5.4. `05-04-merge-llm-tikhonov-homonym-disambiguation.ts`
Required substep of the LLM workflow.

Merges filled chunk `.llm.csv` files into:
- `data/roots/llm-tikhonov-homonym-disambiguation.llm.csv`

#### 5.5. `05-05-validate-llm-tikhonov-homonym-disambiguation.ts`
Optional validation helper.

### 6. Residual LLM roots

#### 6.1. `06-01-build-llm-roots.ts`
Builds:
- `data/roots/llm-roots.original.csv`

This step prepares the remaining lemma-level cases that were not solved by:
- direct Kuznetsova coverage
- automatic Tikhonov resolution
- root-level LLM mapping
- homonym disambiguation

This includes:
- lemmas whose Tikhonov roots produced conflicting automatic Kuznetsova matches
- lemmas whose step 3 (root-level LLM mapping) ended with `lemma_level_conflict`
- lemmas that still remain unresolved after root-level mapping
- mixed cases where some roots are homonym candidates and other roots are still unresolved

#### 6.2. `06-02-prompt-llm-roots.md`
Prompt instructions for the LLM step.

Important:
- the LLM fills `roots`
- output is still on the level of `root`
- if a new root is needed, it is written as a new `root`
- later it will behave as `canonical_root = root`
- the input rows may also include already fixed deterministic roots and separate homonym-candidate positions
- this prompt explicitly covers split and merge workflow
- context file for LLM: `data/roots/resolved-roots.csv`

#### 6.3. `06-03-split-llm-roots.ts`
Required substep of the LLM workflow.

Splits:
- `data/roots/llm-roots.original.csv`

Into chunk pairs under:
- `data/roots/llm-roots.chunks`

#### 6.4. `06-04-merge-llm-roots.ts`
Required substep of the LLM workflow.

Merges filled chunk `.llm.csv` files into:
- `data/roots/llm-roots.llm.csv`

#### 6.5. `06-05-validate-llm-roots.ts`
Optional validation helper.

### 7. `07-build-dictionary-source-with-roots.ts`
Builds:
- `data/roots/dictionary-source-with-roots.csv`

Reads:
- `data/dictionary-source.csv`
- `data/roots/lemmas_to_roots_fixed.tsv`
- `data/external/train_Tikhonov_reformat.txt`
- `data/roots/tikhonov-auto-root-resolution.csv`
- `data/roots/llm-tikhonov-root-mapping.llm.csv`
- `data/roots/resolved-roots.csv`
- `data/roots/llm-tikhonov-homonym-disambiguation.llm.csv`
- `data/roots/llm-roots.llm.csv`

Final rule:
- the final `roots` column always uses `canonical_root`
- for roots unknown to Kuznetsova, this still works because `canonical_root = root`

Resolution order:
1. If the lemma exists in Kuznetsova, step 7 uses the Kuznetsova roots directly and converts them to `canonical_root`.
2. Otherwise, step 7 starts from the Tikhonov raw roots and keeps every root that is already resolved at the root level:
   - deterministic auto-resolutions from step 2
   - root-level decisions from step 3 (`mapped` and `new_root`)
   - if this already resolves the whole lemma, step 7 finishes here
3. If unresolved positions remain and the lemma has a completed step-5 row, step 7 uses that row as the complete lemma-level result and converts its roots to `canonical_root`.
4. If unresolved positions still remain and the lemma has a completed step-6 row, step 7 uses that row as the complete final lemma-level fallback and converts its roots to `canonical_root`.
5. `resolved-roots.csv` is the canonicalization layer for every non-Kuznetsova root that reaches this step.

Step 7 fails fast if:
- a step 5 or step 6 row has an empty `roots` field
- no final roots can be assembled for a lemma after applying all previous steps
- a required `.llm.csv` artifact is missing

## Run Order

Install local dependencies once:

```bash
cd scripts/roots
npm install
```

Then run the pipeline:

```bash
node 01-build-kuznetsova-roots.ts
node 02-build-tikhonov-auto-root-resolution.ts
node 03-01-build-llm-tikhonov-root-mapping.ts
```

Use LLM for the root-mapping step:
- give the model prompt `03-02-prompt-llm-tikhonov-root-mapping.md`
- give it `data/roots/llm-tikhonov-root-mapping.original.csv`
- provide `data/roots/kuznetsova-roots.csv` as context
- provide these helper scripts as context:
  - `03-03-split-llm-tikhonov-root-mapping.ts`
  - `03-04-merge-llm-tikhonov-root-mapping.ts`
- the LLM/agent should:
  - run the split step
  - process every generated chunk `.original.csv`
  - write the matching chunk `.llm.csv` files
  - run the merge step
  - leave the merged result in `data/roots/llm-tikhonov-root-mapping.llm.csv`

Optionally validate:

```bash
node 03-05-validate-llm-tikhonov-root-mapping.ts
```

Continue:

```bash
node 04-build-resolved-roots.ts
node 05-01-build-llm-tikhonov-homonym-disambiguation.ts
```

Use LLM for the homonym-disambiguation step:
- give the model prompt `05-02-prompt-llm-tikhonov-homonym-disambiguation.md`
- give it `data/roots/llm-tikhonov-homonym-disambiguation.original.csv`
- provide `data/roots/kuznetsova-roots.csv` as context
- provide these helper scripts as context:
  - `05-03-split-llm-tikhonov-homonym-disambiguation.ts`
  - `05-04-merge-llm-tikhonov-homonym-disambiguation.ts`
- the LLM/agent should:
  - run the split step
  - process every generated chunk `.original.csv`
  - write the matching chunk `.llm.csv` files
  - run the merge step
  - leave the merged result in `data/roots/llm-tikhonov-homonym-disambiguation.llm.csv`

Optionally validate:

```bash
node 05-05-validate-llm-tikhonov-homonym-disambiguation.ts
```

Then:

```bash
node 06-01-build-llm-roots.ts
```

Use LLM for the residual-roots step:
- give the model prompt `06-02-prompt-llm-roots.md`
- give it `data/roots/llm-roots.original.csv`
- provide `data/roots/resolved-roots.csv` as context
- provide these helper scripts as context:
  - `06-03-split-llm-roots.ts`
  - `06-04-merge-llm-roots.ts`
- the LLM/agent should:
  - run the split step
  - process every generated chunk `.original.csv`
  - write the matching chunk `.llm.csv` files
  - run the merge step
  - leave the merged result in `data/roots/llm-roots.llm.csv`

Optionally validate:

```bash
node 06-05-validate-llm-roots.ts
```

Finish:

```bash
node 07-build-dictionary-source-with-roots.ts
```

## Notes
- Do not modify `data/dictionary-source.csv`.
- The main LLM output fields are always written into `.llm.csv` files, never into `.original.csv`.
- Validator scripts are optional helpers. Main pipeline steps read `.llm.csv` files directly.
