[English](README.md) | [Русский](README.ru.md)

# Russian Diceware 4d6

## Versioning

The dictionary uses two version levels: **edition** (`ed`) and **revision** (`rev`).

- A new edition is required whenever the wordlist, dice combinations assigned to words, transliterations, abbreviations, or numeric codes change. Passwords are tied to a specific edition.
- A revision may change layout, visual design, descriptions, and instructions, but must preserve all of the dictionary parameters listed above. All revisions of the same edition are compatible: to recover a password, use the same edition with any revision.

Edition and revision numbering starts at 1. Each new edition resets the revision number to 1.

## Repository structure

This repository is split into two top-level areas:

- `dictionary/` contains the end-user artifacts of Russian Diceware 4d6.
- `source/` contains the inputs and production materials used to build those artifacts.

```text
/
├── dictionary/
│   ├── editions/
│   └── wordlists/
└── source/
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

- `dictionary/editions/` stores human-readable editions of the dictionary for reading on screen and/or printing, with instructions included in the dictionary itself.
- `dictionary/wordlists/` stores machine-usable wordlists in TSV format.
- `source/data/` stores external inputs, intermediate artifacts, and per-pipeline data outputs.
- `source/pipelines/` stores the code-like artifacts of each pipeline: scripts, prompts, configs, and pipeline-specific notes.
