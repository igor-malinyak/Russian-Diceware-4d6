[English](README.md) | [Русский](README.ru.md)

# Wordlist pipeline

This pipeline assembles the Russian Diceware 4d6 wordlist from the words selected
in the previous stage. It first prepares a single-column CSV for manual edits,
then sorts the words and adds the working fields.

## Steps

### 1. `01-build-selected-words.ts`

Reads:
- `source/data/selection/final-candidates-selected-1296.csv`

Builds:
- `source/data/wordlist/selected-words.csv`

Step logic:
- reads stable identifiers from `Number` and words from `Lemma`
- fails when an empty or duplicate word or `Number` is found
- preserves `Number`, the original spelling, and row order

The output CSV has these columns:

```text
Number,word
```

### 2. Make manual edits

From the repository root, create a working copy of the selected words:

```bash
cp source/data/wordlist/selected-words.csv source/data/wordlist/edited-words.csv
```

Then manually edit `source/data/wordlist/edited-words.csv`.
Keep `Number` unchanged and edit only `word`.

### 3. `03-build-word-metadata-input.ts`

Reads:
- `source/data/wordlist/edited-words.csv`

Builds:
- `source/data/wordlist/word-metadata-input.csv`

Step logic:
- sorts the words in Russian dictionary order, treating `е` and `ё` as equivalent
- preserves `Number` while words are edited and reordered
- fails when an empty or duplicate word or `Number` is found
- fills `transliteration` automatically
- leaves `abbreviation` empty for manual completion

The output CSV has these columns:

```text
Number,word,transliteration,abbreviation
```

### 4. Complete the manual fields

From the repository root, create a working copy of the prepared table:

```bash
cp source/data/wordlist/word-metadata-input.csv source/data/wordlist/word-metadata-completed.csv
```

Then manually edit `source/data/wordlist/word-metadata-completed.csv`:
- fill in `abbreviation`

`word-metadata-input.csv` remains an automatically generated artifact and is not edited
manually.

### 5. `05-build-final-wordlist.ts`

Reads:
- `source/data/wordlist/word-metadata-completed.csv`
- `source/data/selection/final-candidates-selected-1000.csv`

Builds:
- `source/data/wordlist/wordlist.csv`

Step logic:
- assigns four-dice combinations from `1111` through `6666`
- assigns numeric codes from `000` through `999` to the 1,000 highest-ranked words
  in dictionary order; leaves the code empty for the other 296 words
- validates completeness and the uniqueness of words, identifiers, and abbreviations
- validates that every abbreviation consists of exactly three lowercase Latin letters
- validates that an abbreviation starts with the first transliteration letter and that
  its remaining letters occur in the transliteration in the same order

The final CSV has these columns:

```text
Dices,Word,Transliteration,Abbreviation,Numeric code
```

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
cd source/pipelines/wordlist
npm install
```

Then run step 1:

```bash
node 01-build-selected-words.ts
```

Complete the manual corrections in step 2, then run step 3:

```bash
node 03-build-word-metadata-input.ts
```

Afterward, complete the manual work described in step 4 and build the final CSV:

```bash
node 05-build-final-wordlist.ts
```
