[English](README.md) | [Русский](README.ru.md)

# Word selection pipeline

## Method
This pipeline prepares working files for manual word selection based on
`source/data/attributes/dictionary-top-with-attributes.csv`.
It also ranks the lemmas from
`source/data/attributes/extra-lemmas-with-attributes.csv`.
It also appends frequent lemmas with multiple distinct root bases that were excluded
when that input was assembled.

It does not infer new attributes. Instead, it ranks each lemma using the data already produced by the previous stages:
- lemma `IPM`
- root `IPM`
- `imageability`
- `emotional_valence`
- `is_profane`
- lemma length

The process produces the following intermediate working files:
- `dictionary-top-ranked.csv` keeps all non-zero candidates together with `ranking_score`
- `extra-lemmas-ranked.csv` ranks the extra lemmas using the same formula
- `manual-selection.csv` shows up to five strongest candidates per root in a compact review grid
- `manual-selection-completed.csv` records the results of the first manual selection
- `final-candidates-ranked.csv` combines the manually selected lemmas and sorts them by descending `ranking_score`

The final artifact, `final-candidates-selected.csv`, contains the manually reduced
list of 1,296 words.

`manual-selection-completed.csv` is created as a copy of `manual-selection.csv` and
then filled in manually. Place an `x` in the `S` column to the left of each selected
word. If a required lemma is not among the proposed candidates, enter it in the
`Extra` column. Separate multiple lemmas in `Extra` with commas.

## Ranking score

`ranking_score` is computed as:

```text
( Avg_IPM + imageability_bonus ) * imageability_factor * emotional_valence_factor * profanity_factor * length_factor
```

Where:
- `Avg_IPM` is the geometric mean of lemma `IPM` and root `IPM`
- `profanity_factor` is derived from `is_profane`

### `imageability_bonus`
- `400` for `imageability = 5`
- `200` for `imageability = 4`
- `0` otherwise

### `imageability_factor`
- `0.25` for `imageability = 1`
- `0.5` for `imageability = 2`
- `1` otherwise

### `emotional_valence_factor`
- `0.25` for `emotional_valence = 1`
- `0.5` for `emotional_valence = 2`
- `1` otherwise

### `profanity_factor`
- `1` for `is_profane = 0`
- `0` for `is_profane = 1`

### `length_factor`
- `0` for length `< 2` or `> 12`
- `4.5` for length `2` or `3`
- `4` for length `4`
- `3.5` for length `5`
- `3` for length `6`
- `2.5` for length `7`
- `2` for length `8`
- `1.75` for length `9`
- `1.5` for length `10`
- `1.25` for length `11`
- `1` for length `12`

## Final artifact

The final artifact of this pipeline is:
- `source/data/selection/final-candidates-selected.csv`

## Steps

### 1. `01-build-selection-inputs.ts`

Builds:
- `source/data/selection/dictionary-top-ranked.csv`
- `source/data/selection/extra-lemmas-ranked.csv`
- `source/data/selection/manual-selection.csv`

Reads:
- `source/data/attributes/dictionary-top-with-attributes.csv`
- `source/data/attributes/extra-lemmas-with-attributes.csv`
- `source/data/roots/dictionary-source-with-roots.csv`

Step logic:
- computes `ranking_score` for every row in both attribute inputs
- removes rows with `ranking_score = 0`
- writes `dictionary-top-ranked.csv` with all original fields plus `ranking_score`
- writes `extra-lemmas-ranked.csv` in the same format and root-group order
- groups rows in `dictionary-top-ranked.csv` by `root`
- sorts rows inside each root group by descending `ranking_score`
- sorts root groups by descending maximum `ranking_score` within the group
- writes `manual-selection.csv` with the repeated columns `S`, `Lemma`, `RS` five times
- for each root, takes the top 5 lemmas by `ranking_score`
- if a root has fewer than 5 eligible lemmas, the remaining cells stay empty
- keeps the root-row order in `manual-selection.csv` identical to the root-group order in `dictionary-top-ranked.csv`
- appends the top 1,000 unique lemmas by `IPM` that have multiple distinct root bases and are absent from the attributes input. Homonym variants of one root base are excluded, matching the attributes-input filter
- each appended row contains one lemma, and its `RS` cell contains `IPM` rather than `ranking_score`

### 2. Complete the first manual selection

Create a working copy of the generated review grid:

```bash
cp source/data/selection/manual-selection.csv source/data/selection/manual-selection-completed.csv
```

Then edit `source/data/selection/manual-selection-completed.csv` manually:
- place an `x` in the `S` column immediately before each selected word
- add words absent from the proposed candidates to the `Extra` column when needed
- separate multiple words in `Extra` with commas

### 3. `03-count-manual-selection.ts`

Reads:
- `source/data/selection/manual-selection-completed.csv`

Step logic:
- counts candidates marked with `x` in any `S` column
- parses additional candidates entered in the `Extra` column as a comma-separated list
- prints `selectedFromS`, `selectedFromExtra`, `totalSelected`, and `uniqueSelected`

### 4. `04-build-final-candidates-ranked.ts`

Builds:
- `source/data/selection/final-candidates-ranked.csv`

Reads:
- `source/data/selection/manual-selection-completed.csv`
- `source/data/selection/dictionary-top-ranked.csv`
- `source/data/selection/extra-lemmas-ranked.csv`

Step logic:
- collects lemmas marked with `x` in the `S` columns and lemmas from the `Extra` column
- removes duplicate selected lemmas
- looks up every selected lemma in the two ranked input files
- if a lemma occurs in multiple rows, uses the row with the highest `ranking_score`
- fails if a selected lemma is absent from both ranked input files
- sorts the resulting rows by descending `ranking_score`, then by ascending `Number` when scores are equal
- preserves the same columns as the ranked input files

### 5. Complete the final manual selection

Create a working copy of the ranked candidates:

```bash
cp source/data/selection/final-candidates-ranked.csv source/data/selection/final-candidates-selected.csv
```

Then edit `source/data/selection/final-candidates-selected.csv` manually and leave
exactly 1,296 words in it.

## Running order

Install local dependencies once:

```bash
(cd source/pipelines/selection && npm install)
```

Run all subsequent commands from the repository root. Complete step 1:

```bash
node source/pipelines/selection/01-build-selection-inputs.ts
```

Complete the manual work in step 2, then run the scripts from steps 3 and 4:

```bash
node source/pipelines/selection/03-count-manual-selection.ts
node source/pipelines/selection/04-build-final-candidates-ranked.ts
```

Finally, complete the manual work in step 5.
