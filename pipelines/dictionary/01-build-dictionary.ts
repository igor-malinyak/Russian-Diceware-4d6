import { execFile, spawn } from "node:child_process"
import { copyFile, mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname, resolve } from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { parse } from "csv-parse/sync"
import { stringify } from "csv-stringify/sync"
import escapeLatex from "escape-latex"
import { describeArtifact, nextVersion, readRegistry, releaseTag, sha256, wordlistFingerprint } from "./lib.ts"
import type { ReleaseRegistry, ReleaseVersion } from "./lib.ts"

type WordlistRow = {
  Dices: string
  Word: string
  Transliteration: string
  Abbreviation: string
  "Numeric code": string
}

type Snapshot = Map<string, Buffer>

const fonts = ["golostext-400.ttf", "golostext-500.ttf", "jetbrainsmono-400.ttf", "tabler-300.ttf"]
const licenses = ["Golos-Text-OFL.txt", "JetBrains-Mono-OFL.txt", "Tabler-Icons-LICENSE.txt"]
const basename = "russian-diceware-4d6"

export function readWordlist(csv: Buffer): { rows: WordlistRow[], tsv: string, wordlistSha256: string } {
  const records = parse(csv, { bom: true, skip_empty_lines: true }) as string[][]
  const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true }) as WordlistRow[]
  return {
    rows,
    tsv: stringify(records, { delimiter: "\t", record_delimiter: "\n" }),
    wordlistSha256: wordlistFingerprint(records),
  }
}

export function renderVersion(version: ReleaseVersion): string {
  return [
    String.raw`\newcommand{\DictionaryEdition}{${version.edition}}`,
    String.raw`\newcommand{\DictionaryRevision}{${version.revision}}`,
    "",
  ].join("\n")
}

export function renderRows(rows: WordlistRow[]): string {
  return rows
    .map((row) => {
      const diceSymbols = [...row.Dices]
        .map((die) => String.fromCodePoint(0x267f + Number(die)))
        .join("")
      const bookmark = /^[1-6]111$/.test(row.Dices)
        ? String.raw`\pdfbookmark[1]{${diceSymbols} ${escapeLatex(row.Word)}}{dictionary-${row.Dices}}`
        : ""
      const bookmarkArgument = bookmark ? `[{${bookmark}}]` : ""
      return String.raw`\TableDataRow${bookmarkArgument}`
        + `{${escapeLatex(row.Dices)}}`
        + `{${escapeLatex(row.Word)}}`
        + `{${escapeLatex(row.Transliteration)}}`
        + `{${escapeLatex(row.Abbreviation)}}`
        + `{${escapeLatex(row["Numeric code"])}}`
    })
    .join("\n")
}

async function runLatexmk(workDirectory: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const process = spawn(
      "latexmk",
      ["-lualatex", "-interaction=nonstopmode", "-halt-on-error", "-outdir=build", "dictionary.tex"],
      {
        cwd: workDirectory,
        shell: false,
        stdio: "inherit",
      },
    )

    process.once("error", rejectPromise)
    process.once("exit", (code) => {
      if (code === 0) {
        resolvePromise()
      } else {
        rejectPromise(new Error(`latexmk exited with code ${code ?? "unknown"}`))
      }
    })
  })
}

async function validateLayout(workDirectory: string): Promise<void> {
  const logPath = join(workDirectory, "build/dictionary.log")
  const log = await readFile(logPath, "utf8")
  const overflows = log.match(/^Overfull\s+\\[hv]box\b.*$/gm) ?? []

  if (overflows.length > 0) {
    throw new Error(
      `Found ${overflows.length} overfull boxes. The final PDF was not updated.\n`
        + `${overflows.join("\n")}\nLog: ${logPath}`,
    )
  }
}

async function readSourceFiles(repositoryRoot: string): Promise<Snapshot> {
  const paths = [
    "data/wordlist/wordlist.csv",
    "data/dictionary/releases.json",
    "data/dictionary/dictionary.tex",
    "data/dictionary/dictionary-layout.tex",
    ...fonts.map((font) => "data/external/fonts/" + font),
    ...licenses.map((license) => "data/external/fonts/licenses/" + license),
    ...["01-build-dictionary.ts", "lib.ts", "package.json", "package-lock.json"]
      .map((name) => "pipelines/dictionary/" + name),
  ]
  const snapshot: Snapshot = new Map()
  for (const path of paths) {
    snapshot.set(path, await readFile(join(repositoryRoot, path)))
  }
  return snapshot
}

async function prepareBuildWorkspace(snapshot: Snapshot, version: ReleaseVersion): Promise<string> {
  const workDirectory = await mkdtemp(join(tmpdir(), "russian-diceware-dictionary-"))
  await mkdir(join(workDirectory, "build"))
  await mkdir(join(workDirectory, "fonts"))
  for (const name of ["dictionary.tex", "dictionary-layout.tex"]) {
    await writeFile(join(workDirectory, name), snapshot.get("data/dictionary/" + name)!)
  }
  for (const font of fonts) {
    await writeFile(join(workDirectory, "fonts", font), snapshot.get("data/external/fonts/" + font)!)
  }
  await writeFile(join(workDirectory, "dictionary-version.tex"), renderVersion(version))
  return workDirectory
}

async function currentCommit(repositoryRoot: string): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot })
    return stdout.trim()
  } catch {
    return null
  }
}

export function selectVersion(registry: ReleaseRegistry, wordlistSha256: string): ReleaseVersion {
  const lastRelease = registry.releases.at(-1)
  return lastRelease ? nextVersion(lastRelease, wordlistSha256) : { edition: 1, revision: 1 }
}

export async function buildLocalRelease(repositoryRoot: string) {
  const dictionaryDirectory = join(repositoryRoot, "data/dictionary")
  const outputDirectory = join(dictionaryDirectory, "output")
  let workDirectory: string | undefined
  let complete = false
  try {
    const snapshot = await readSourceFiles(repositoryRoot)
    const csv = snapshot.get("data/wordlist/wordlist.csv")!
    const wordlist = readWordlist(csv)
    const registry = readRegistry(snapshot.get("data/dictionary/releases.json")!.toString("utf8"))
    const version = selectVersion(registry, wordlist.wordlistSha256)
    const commit = await currentCommit(repositoryRoot)
    workDirectory = await prepareBuildWorkspace(snapshot, version)
    console.log("Building " + releaseTag(version) + ". Working directory: " + workDirectory)
    await writeFile(join(workDirectory, "dictionary-rows.tex"), renderRows(wordlist.rows) + "\n")
    await runLatexmk(workDirectory)
    await validateLayout(workDirectory)
    await rm(outputDirectory, { recursive: true, force: true })
    await mkdir(outputDirectory)
    const names = [basename + ".pdf", basename + ".csv", basename + ".tsv"]
    await copyFile(join(workDirectory, "build/dictionary.pdf"), join(outputDirectory, names[0]))
    await writeFile(join(outputDirectory, names[1]), csv)
    await writeFile(join(outputDirectory, names[2]), wordlist.tsv)
    const artifacts = await Promise.all(names.map((name) => describeArtifact(outputDirectory, name)))
    const manifest = {
      tag: releaseTag(version),
      ...version,
      wordlistSha256: wordlist.wordlistSha256,
      source: {
        commit,
        files: [...snapshot].map(([path, bytes]) => ({ path, sha256: sha256(bytes) })),
      },
      artifacts,
    }
    await writeFile(join(outputDirectory, "release.json"), JSON.stringify(manifest, null, 2) + "\n")
    complete = true
    return { version, outputDirectory }
  } finally {
    if (complete && workDirectory) {
      await rm(workDirectory, { recursive: true, force: true }).catch((error) => {
        console.warn("Could not remove the temporary directory: " + workDirectory, error)
      })
    }
  }
}

const scriptPath = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const repositoryRoot = resolve(dirname(scriptPath), "../..")
  const result = await buildLocalRelease(repositoryRoot)
  console.log(`Prepared ${releaseTag(result.version)}: ${result.outputDirectory}`)
}
