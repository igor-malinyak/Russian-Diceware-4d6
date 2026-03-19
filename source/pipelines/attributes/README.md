[English](README.md) | [Русский](README.ru.md)

# Word attribute pipeline

## Method
This pipeline adds three semantic attributes to frequent lemmas:
- `imageability`
- `emotional_valence`
- `is_profane`

First, it builds a working lemma list from the dictionary with roots:
- only lemmas with one root are kept
- the most frequent roots are selected
- for each such root, the most frequent lemmas are kept, with the most frequent words in the dictionary included additionally

This produces a compact and representative slice of the dictionary in `dictionary-top.csv`.

Then the LLM is used only to assign three independent judgments for each lemma:
- how vividly the word evokes a concrete image
- what its typical emotional polarity is
- whether it is profane

Those judgments are then attached back to the working list to produce the final attribute file.

### Field definitions

#### `imageability`
How easily the word, in isolation, evokes a concrete sensory image, object, creature, action, property, feeling, or scene.

The score is assigned:
- without extra context
- using the most common modern meaning of the word

Scale:
- `1` — almost no image; mostly abstract, logical, or functional
- `2` — weak, vague, or highly context-dependent image
- `3` — some image exists, but it is not very concrete or not immediate
- `4` — the word evokes a clear image, scene, action, or sensory property
- `5` — the word very quickly evokes a sharp and concrete image

Practical rule:
if the word can be easily imagined, shown, drawn, acted out, or described as a clear sensory property, it is usually `4` or `5`.

#### `emotional_valence`
The typical emotional polarity of the word in modern neutral usage.

The score is based on the ordinary emotional reaction the word itself tends to evoke.

Scale:
- `1` — clearly negative
- `2` — somewhat negative
- `3` — neutral
- `4` — somewhat positive
- `5` — clearly positive

Practical rule:
if the word is neither positive nor negative on its own, use `3`.

#### `is_profane`
Whether the word is profane, obscene, or strongly insulting in ordinary modern Russian.

Values:
- `1` — the word is profane, obscene, or stably used as a direct insult
- `0` — the word is not profane

Use `1` for:
- mat
- obscene vocabulary
- harsh swear words
- words that are commonly understood as a direct insult

Use `0` for:
- merely negative words
- unpleasant words
- rough but non-profane everyday words
- words about heavy themes if the word itself is not profanity

## Artifacts
Final artifact of this pipeline:
- `source/data/attributes/dictionary-top-with-attributes.csv`

## Steps

### 1. `01-build-dictionary-top.ts`
Builds:
- `source/data/attributes/dictionary-top.csv`

Reads:
- `source/data/roots/dictionary-source-with-roots.csv`
- `source/data/roots/root-ipm.csv`

Step logic:
- the file mirrors `source/data/roots/dictionary-source-with-roots.csv`, but `roots` is replaced with `root` and `root_IPM` is added
- only lemmas with one `root` are included
- exception: if a row has multiple roots but all of them are homonym variants of the same base root, the row is split into multiple rows, one per `root`
- only the 5000 most frequent roots by `IPM` from `source/data/roots/root-ipm.csv` are kept
- for each root, the 10 most frequent lemmas by `IPM` are kept
- if a lemma belongs to the global top 5000 by `IPM` across the whole dictionary, it is included even above the limit of 10 rows per root
- if the same `Lemma` + `root` pair appears in multiple rows, only the row with the highest `IPM` is kept
- final ordering is:
  - rows grouped by `root`
  - root groups sorted by descending `root_IPM`
  - rows inside each group sorted by descending `IPM`

### 2. Filling attributes with LLM

#### 2.1. `02-01-build-llm-attributes.ts`
Builds:
- `source/data/attributes/llm-attributes.original.csv`

Reads:
- `source/data/attributes/dictionary-top.csv`

Step logic:
- takes only `Number` and `Lemma` from `dictionary-top.csv`
- adds empty `imageability`, `emotional_valence`, and `is_profane` columns
- preserves the row order from `dictionary-top.csv`

#### 2.2. `02-02-split-llm-attributes.ts`
Builds:
- `.original.csv` files under `source/data/attributes/llm-attributes.chunks/`

Reads:
- `source/data/attributes/llm-attributes.original.csv`

Step logic:
- splits the prepared CSV into independent parts for manual LLM runs
- creates one source file for each part

### 2.3. `02-03-prompt-llm-attributes.md`
Prompt instructions for the LLM step.

Important:
- the LLM fills only `imageability`, `emotional_valence`, and `is_profane`
- each row is judged independently from the word itself
- the LLM does not change the CSV structure and does not add new fields

### 2.4. `02-04-merge-llm-attributes.ts`
Builds:
- `source/data/attributes/llm-attributes.llm.csv`

Reads:
- filled `.llm.csv` files from `source/data/attributes/llm-attributes.chunks/`

Step logic:
- merges the completed parts back into one file
- checks chunk header consistency

### 2.5. `02-05-validate-llm-attributes.ts`
Checks:
- `source/data/attributes/llm-attributes.llm.csv`

Step logic:
- ensures no rows were lost
- ensures `Number` and `Lemma` were not changed
- ensures original row order was preserved
- checks that `imageability`, `emotional_valence`, and `is_profane` are filled
- checks allowed values:
  - `imageability`: `1`–`5`
  - `emotional_valence`: `1`–`5`
  - `is_profane`: `0` or `1`

### 3. `03-build-dictionary-top-with-attributes.ts`
Builds:
- `source/data/attributes/dictionary-top-with-attributes.csv`

Reads:
- `source/data/attributes/dictionary-top.csv`
- `source/data/attributes/llm-attributes.llm.csv`

Step logic:
- takes all rows from `dictionary-top.csv`
- attaches `imageability`, `emotional_valence`, and `is_profane`
- checks that rows match between the two input files
- preserves original order and all fields from `dictionary-top.csv`

## Running order

Install local dependencies once:

```bash
cd source/pipelines/attributes
npm install
```

Then run:

```bash
node 01-build-dictionary-top.ts
node 02-01-build-llm-attributes.ts
node 02-02-split-llm-attributes.ts
```

Then fill the `*.llm.csv` files in `source/data/attributes/llm-attributes.chunks/`
using `02-03-prompt-llm-attributes.md`.

Then continue:

```bash
node 02-04-merge-llm-attributes.ts
node 02-05-validate-llm-attributes.ts
node 03-build-dictionary-top-with-attributes.ts
```
