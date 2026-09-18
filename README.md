[English](README.md) | [Русский](README.ru.md)

# Russian Diceware 4d6

## Versioning

The dictionary uses two version levels: **edition** (`ed`) and **revision** (`rev`).

- A new edition is required whenever the wordlist, dice combinations assigned to words, transliterations, abbreviations, or numeric codes change. Passwords are tied to a specific edition.
- A revision may change layout, visual design, descriptions, and instructions, but must preserve all of the dictionary parameters listed above. All revisions of the same edition are compatible: to recover a password, use the same edition with any revision.

Edition and revision numbering starts at 1. Each new edition resets the revision number to 1.

## Repository structure

The repository contains dictionary inputs and production materials. Published PDF, CSV, and TSV files are distributed through GitHub Releases.

```text
/
├── data/
│   ├── external/
│   ├── attributes/
│   ├── roots/
│   ├── selection/
│   └── wordlist/
└── pipelines/
    ├── attributes/
    ├── roots/
    ├── selection/
    └── wordlist/
```

## What goes where

- `data/` stores external inputs, intermediate artifacts, and per-pipeline data outputs.
- `pipelines/` stores the code-like artifacts of each pipeline: scripts, prompts, configs, and pipeline-specific notes.
- GitHub Releases stores published dictionary editions and revisions, including the PDF with instructions and machine-usable CSV and TSV wordlists.
