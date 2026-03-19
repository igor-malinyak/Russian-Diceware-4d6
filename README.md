[English](README.md) | [Русский](README.ru.md)

# Russian Diceware 4d6

## Repository structure

This repository is split into two top-level areas:

- `dictionary/` contains the end-user artifacts of Russian Diceware 4d6.
- `source/` contains the inputs and production materials used to build those artifacts.

```text
/
├── dictionary/
│   ├── editions/
│   ├── wordlists/
│   └── docs/
└── source/
    ├── data/
    │   ├── external/
    │   ├── roots/
    │   └── ...
    └── pipelines/
        ├── roots/
        └── ...
```

## What goes where

- `dictionary/editions/` stores human-readable editions of the dictionary for reading on screen and/or printing.
- `dictionary/wordlists/` stores machine-usable wordlists in TSV format.
- `dictionary/docs/` stores end-user documentation for using the dictionary.
- `source/data/` stores external inputs, intermediate artifacts, and per-pipeline data outputs.
- `source/pipelines/` stores the code-like artifacts of each pipeline: scripts, prompts, configs, and pipeline-specific notes.
