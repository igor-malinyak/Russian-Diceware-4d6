[English](README.md) | [Русский](README.ru.md)

# Wordlist pipeline

This pipeline assembles the Russian Diceware 4d6 wordlist from the words selected
in the previous stage. It first prepares a single-column CSV for manual edits,
then sorts the words and adds the working fields.

## Steps

### 1. `01-build-selected-words.ts`

Reads:
- `source/data/selection/final-candidates-selected.csv`

Builds:
- `source/data/wordlist/selected-words.csv`

Step logic:
- reads the words from the `Lemma` column
- fails when an empty or duplicate word is found
- preserves the original spelling and row order
- writes only the `word` column

The output CSV has one column:

```text
word
```

### 2. Make manual edits

Create a working copy of the selected words:

```bash
cp source/data/wordlist/selected-words.csv source/data/wordlist/edited-words.csv
```

Then manually edit `source/data/wordlist/edited-words.csv`.

### 3. `03-build-word-metadata-input.ts`

Reads:
- `source/data/wordlist/edited-words.csv`

Builds:
- `source/data/wordlist/word-metadata-input.csv`

Step logic:
- sorts the words according to the Russian alphabet, taking `ё` into account
- fills `transliteration` automatically
- leaves `abbreviation` and `top_1000` empty for manual completion

The output CSV has these columns:

```text
word,transliteration,abbreviation,top_1000
```

### 4. Complete the manual fields

Create a working copy of the prepared table:

```bash
cp source/data/wordlist/word-metadata-input.csv source/data/wordlist/word-metadata-completed.csv
```

Then manually edit `source/data/wordlist/word-metadata-completed.csv`:
- fill in `abbreviation`
- fill in `top_1000`

`word-metadata-input.csv` remains an automatically generated artifact and is not edited
manually.

## Transliteration rules

Every letter has one deterministic replacement. The only context-dependent rule
applies to `е`: it becomes `ye` immediately after `ь` or `ъ`, and `e` everywhere else.

| Letter | Transliteration |
| --- | --- |
| а | `a` |
| б | `b` |
| в | `v` |
| г | `g` |
| д | `d` |
| е | `e`; `ye` immediately after `ь` or `ъ` |
| ё | `yo` |
| ж | `zh` |
| з | `z` |
| и | `i` |
| й | `y` |
| к | `k` |
| л | `l` |
| м | `m` |
| н | `n` |
| о | `o` |
| п | `p` |
| р | `r` |
| с | `s` |
| т | `t` |
| у | `u` |
| ф | `f` |
| х | `h` |
| ц | `ts` |
| ч | `ch` |
| ш | `sh` |
| щ | `shch` |
| ь | omitted |
| ы | `y` |
| ъ | omitted |
| э | `e` |
| ю | `yu` |
| я | `ya` |

## Running order

Install local dependencies once:

```bash
(cd source/pipelines/wordlist && npm install)
```

Then run step 1 from the repository root:

```bash
node source/pipelines/wordlist/01-build-selected-words.ts
```

Complete the manual corrections in step 2, then run step 3:

```bash
node source/pipelines/wordlist/03-build-word-metadata-input.ts
```

Afterward, complete the manual work described in step 4.
