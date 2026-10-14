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
- `data/dictionary/last-release.json`
- fonts and licenses from `data/external/fonts/`

Creates in `data/dictionary/output/`:
- `russian-diceware-4d6.pdf` — the dictionary with edition and revision on the cover
- `russian-diceware-4d6.csv` — a byte-for-byte copy of the final CSV
- `russian-diceware-4d6.tsv` — the same columns, values, and row order with tabs as the delimiter
- `release.json` — the version, wordlist fingerprint, file and source checksums, and Git `commit`

Step logic:
- selects the version from the last published release
- builds the PDF and checks it for layout errors
- replaces the entire previous local bundle without retaining stale files
- retains the temporary directory and log on compilation failure without changing `output/`

Git ignores the bundle. The build does not update the last-release record, create tags, or contact GitHub.
`release.json` records the current HEAD. Checksums identify the exact source versions used.

### 3. Check the bundle

Open the PDF in `data/dictionary/output/` and check the content and layout.
If changes are needed, repeat steps 1 and 2, then check the new PDF.
Use only the latest checked bundle for a release, without rebuilding it.

### 4. `02-publish-release.ts`

Reads:
- the checked bundle in `data/dictionary/output/`
- the handwritten release description in `data/dictionary/output/release-notes.md`
- the sources listed in `release.json`
- `data/dictionary/last-release.json` and the GitHub Releases state

Creates:
- a tag and GitHub Release with the bundle if the release has not yet been published
- an updated last-release record in `data/dictionary/last-release.json`, a separate `commit`, and a `push` to `main`

Step logic:
- checks bundle integrity and version consistency before publication without rebuilding the files
- publishes the checked bundle to GitHub Releases, then verifies the release before updating the local record and running `commit` and `push` to `main`
- never replaces a published release, and on a retry finishes an interrupted local-record or Git update
- stops if GitHub disagrees or an incomplete draft or tag without a release exists

Prints the result:
- `published` — a new release was created, and its local record was committed and pushed to `main`.
- `reconciled` — the release already existed on GitHub but the local record had not been updated. The script verified the release and updated the record.
- `recorded` — both the release and local record already existed. The script verified them and, if needed, finished an interrupted `commit` or `push`.

## Version selection

`data/dictionary/last-release.json` stores only the last published release in its `lastRelease` field. Before the first publication, this field is `null`. The record contains positive integers `edition`, `revision`, and the `wordlistSha256` from the published bundle metadata. Selecting the next version does not require GitHub access.

Release history lives in GitHub Releases, while earlier versions of the local record remain in Git history.

- No releases yet — `ed1-rev1`.
- Data matches the last published release — the next revision of that edition.
- Data changed — the next edition with its first revision.

Version selection compares the content and order of the dictionary data. Repeated builds before publication retain the release number. Trial builds do not update the last-release record.

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

### 3. Install GitHub CLI once

Install [GitHub CLI](https://cli.github.com/) and check the installation:

```bash
gh --version
```

Authenticate `gh` with an account that has write access to `igor-malinyak/Russian-Diceware-4d6`:

```bash
gh auth login
gh auth status
```

A fine-grained token needs the `Contents: write` permission. The final `git push` also requires Git access to `origin` and permission to `push` to `main`.

### 4. Install script dependencies once

From the repository root:

```bash
cd pipelines/dictionary
npm ci
```

### 5. Build the bundle

After editing the inputs and preparing the final wordlist, `commit` and `push` the sources to `main`. Then run from `pipelines/dictionary/`:

```bash
node 01-build-dictionary.ts
```

### 6. Publish the checked bundle

After manually checking the local bundle, prepare `data/dictionary/output/release-notes.md` with a Markdown description of the release changes. This file stays local, while the published text lives in the GitHub Release description. Prepare notes after the final build because rebuilding replaces the entire `output/` directory.

Then run from a clean `main` branch in `pipelines/dictionary/`:

```bash
gh auth status
node 02-publish-release.ts
```
