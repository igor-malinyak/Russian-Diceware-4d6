[English](README.md) | [Русский](README.ru.md)

# Dictionary build

This pipeline builds the Russian Diceware 4d6 dictionary from the final wordlist and editable content.

## Steps

### 1. Edit the inputs

Edit the content in `data/dictionary/dictionary.tex` or the layout in `data/dictionary/dictionary-layout.tex`.
For wordlist changes, edit the inputs of the preceding pipelines and rebuild `data/wordlist/wordlist.csv`.

### 2. `01-build-dictionary.ts`

Reads:
- `data/wordlist/wordlist.csv`
- `data/dictionary/dictionary.tex`
- `data/dictionary/dictionary-layout.tex`
- `data/dictionary/releases.json`
- fonts and licenses from `data/external/fonts/`

Creates in `data/dictionary/output/`:
- `russian-diceware-4d6.pdf` — the dictionary with edition and revision on the cover
- `russian-diceware-4d6.csv` — a byte-for-byte copy of the final CSV
- `russian-diceware-4d6.tsv` — the same columns, values, and row order with tabs as the delimiter
- `release.json` — the version, wordlist fingerprint, file and source checksums, and Git commit

Step logic:
- selects the version from the published release registry
- builds the PDF and checks it for layout errors
- replaces the entire previous local bundle without retaining stale files
- retains the temporary directory and log on compilation failure without changing `output/`

Git ignores the bundle. The build does not update the registry, create tags, or contact GitHub.
`release.json` records the current HEAD. Checksums identify the exact source versions used.

### 3. Check the bundle

Open the PDF in `data/dictionary/output/` and check the content and layout.
If changes are needed, repeat steps 1 and 2, then check the new PDF.
Use only the latest checked bundle for a release, without rebuilding it.

## Version selection

`data/dictionary/releases.json` records published releases only. It is an object with a `releases` array. Each entry contains positive integers `edition`, `revision`, and the `wordlistSha256` from the published bundle metadata. Entries are sequential starting at `ed1-rev1`, without gaps.

- Empty registry — `ed1-rev1`.
- Data matches the last published release — the next revision of that edition.
- Data changed — the next edition with its first revision.

Version selection compares the content and order of the dictionary data. Repeated builds before publication retain the release number. Do not add trial builds to the registry.

## Running the pipeline

### 1. Install Node.js once

Install [Node.js 24](https://nodejs.org/en/download) with npm and check the versions:

```bash
node --version
npm --version
```

### 2. Install TeX Live once

1. Download the [official TeX Live installer](https://www.tug.org/texlive/acquire-netinstall.html) for your platform. On macOS and Linux, unpack the archive and run `perl install-tl --scheme=infraonly` from the extracted directory. On Windows, run the `.exe` installer.

2. Select `scheme-infraonly` (TeX Live infrastructure only) and an installation directory. On Windows, scheme selection is available in the advanced installer settings. See the [TeX Live installation instructions](https://www.tug.org/texlive/quickinstall.html) for details.

3. Add the TeX Live executable directory to `PATH`. It is inside the installation directory at `bin/<platform>`, for example `bin/universal-darwin` on macOS or `bin/windows` on Windows. Open a new terminal and check:

   ```bash
   tlmgr --version
   ```

4. Install LuaLaTeX, latexmk, and the layout packages. `tlmgr` adds package dependencies automatically:

   ```bash
   tlmgr install latex-bin luahbtex luatex luaotfload lualatex-math lm latexmk fontspec babel babel-russian hyphen-russian geometry graphics xcolor tools colortbl fancyhdr hyperref
   ```

   Check the installation:

   ```bash
   lualatex --version
   latexmk --version
   ```

### 3. Install script dependencies once

From the repository root:

```bash
cd pipelines/dictionary
npm ci
```

### 4. Build the bundle

After editing the inputs and preparing the final wordlist, run from `pipelines/dictionary/`:

```bash
node 01-build-dictionary.ts
```
