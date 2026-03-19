[English](README.md) | [Русский](README.ru.md)

# Word attribute pipeline

## Method
TBD

## Steps

### 1. `01-build-dictionary-top.ts`
Builds:
- `source/data/attributes/dictionary-top.csv`

Reads:
- `source/data/roots/dictionary-source-with-roots.csv`
- `source/data/roots/root-ipm.csv`

Step logic:
- the file mirrors `source/data/roots/dictionary-source-with-roots.csv`, but `roots` is replaced with `root` and `root_IPM` is added
- only lemmas with exactly one root are included
- exception: if a row has multiple roots but all of them are homonym variants of the same base root, the row is split into multiple rows, one per `root`
- only the 5000 most frequent roots by `IPM` from `source/data/roots/root-ipm.csv` are kept
- for each root, the 10 most frequent lemmas by `IPM` are kept
- if the same `Lemma` + `root` pair appears in multiple rows, only the row with the highest `IPM` is kept
- final ordering is:
  - rows grouped by `root`
  - root groups sorted by descending `root_IPM`
  - rows inside each group sorted by descending `IPM`

## Running order

Install local dependencies once:

```bash
cd source/pipelines/attributes
npm install
```

Then run:

```bash
node 01-build-dictionary-top.ts
```
