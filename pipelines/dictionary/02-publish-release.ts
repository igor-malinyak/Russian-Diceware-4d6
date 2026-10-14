import { execFile } from "node:child_process"
import { open, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname, resolve, isAbsolute } from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { parse } from "csv-parse/sync"
import { dictionaryBasename, nextVersion, readReleaseRecord, releaseTag, sha256, wordlistFingerprint } from "./lib.ts"
import type { PublishedRelease, ReleaseRecord, ReleaseVersion } from "./lib.ts"

const repository = "igor-malinyak/Russian-Diceware-4d6"
const assetNames = [
  dictionaryBasename + ".pdf",
  dictionaryBasename + ".csv",
  dictionaryBasename + ".tsv",
  "release.json",
]
const releaseNotesName = "release-notes.md"
const digest = /^[a-f0-9]{64}$/
const commitHash = /^[a-f0-9]{40}$/
const runFile = promisify(execFile)
const releaseRecordPath = "data/dictionary/last-release.json"
const repositoryOrigins = [
  `git@github.com:${repository}`,
  `https://github.com/${repository}`,
  `ssh://git@github.com/${repository}`,
]

type FileDigest = { name: string, sha256: string }
type SourceDigest = { path: string, sha256: string }
type Manifest = PublishedRelease & {
  tag: string
  source: { commit: string, files: SourceDigest[] }
  artifacts: FileDigest[]
}
type RemoteRelease = {
  tag_name: string
  draft: boolean
  body: string | null
  assets: { name: string }[]
}
type PublicationState = "new" | "recorded"
type PublicationResult = "published" | "reconciled" | "recorded"
type GitState = "unrecorded" | "recorded-uncommitted" | "recorded-unpushed" | "complete"
type GitSnapshot = {
  branch: string
  origin: string
  head: string
  remote: string
  status: string
  previous?: string
  subject?: string
  changedFiles?: string
}

async function gh(...args: string[]): Promise<string> {
  try {
    const { stdout } = await runFile("gh", args, { maxBuffer: 20 * 1024 * 1024 })
    return stdout.trim()
  } catch (error) {
    throw new Error(
      `gh ${args.slice(0, 2).join(" ")} failed. Check authentication, network access, and permissions.`,
      { cause: error },
    )
  }
}

async function git(root: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await runFile("git", args, { cwd: root })
    return stdout.trim()
  } catch (error) {
    throw new Error(`git ${args.slice(0, 2).join(" ")} failed`, { cause: error })
  }
}

function isFileDigest(value: unknown): value is FileDigest {
  const file = value as FileDigest | null
  return typeof file === "object" && file !== null
    && typeof file.name === "string"
    && typeof file.sha256 === "string" && digest.test(file.sha256)
}

function isSourceDigest(value: unknown): value is SourceDigest {
  const file = value as SourceDigest | null
  return typeof file === "object" && file !== null
    && typeof file.path === "string"
    && typeof file.sha256 === "string" && digest.test(file.sha256)
}

function isSafeSourcePath(path: string): boolean {
  const validParts = path
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..")
  return !isAbsolute(path) && !path.includes("\\") && validParts
}

export function readManifest(json: string): Manifest {
  const value: unknown = JSON.parse(json)
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid release manifest")
  }

  const manifest = value as Manifest
  const validEdition = Number.isSafeInteger(manifest.edition) && manifest.edition > 0
  const validRevision = Number.isSafeInteger(manifest.revision) && manifest.revision > 0
  const validVersion = validEdition && validRevision && manifest.tag === releaseTag(manifest)
  const validFingerprint = typeof manifest.wordlistSha256 === "string" && digest.test(manifest.wordlistSha256)
  const validSource = typeof manifest.source === "object" && manifest.source !== null
    && typeof manifest.source.commit === "string" && commitHash.test(manifest.source.commit)
    && Array.isArray(manifest.source.files) && manifest.source.files.every(isSourceDigest)
  const validArtifacts = Array.isArray(manifest.artifacts) && manifest.artifacts.every(isFileDigest)
  if (!validVersion || !validFingerprint || !validSource || !validArtifacts) {
    throw new Error("Invalid release manifest")
  }

  const names = manifest.artifacts.map((asset) => asset.name)
  if (names.length !== 3 || names.some((name, index) => name !== assetNames[index])) {
    throw new Error("Unexpected artifact list in release manifest")
  }

  const paths = manifest.source.files.map((file) => file.path)
  const uniquePaths = new Set(paths).size === paths.length
  const hasReleaseRecord = paths.includes(releaseRecordPath)
  const safePaths = paths.every(isSafeSourcePath)
  if (paths.length === 0 || !uniquePaths || !hasReleaseRecord || !safePaths) {
    throw new Error("Invalid source paths in release manifest")
  }

  return manifest
}

function expectedVersion(releaseRecord: ReleaseRecord, fingerprint: string): string {
  const previous = releaseRecord.lastRelease
  return releaseTag(previous ? nextVersion(previous, fingerprint) : { edition: 1, revision: 1 })
}

export function getPublicationState(releaseRecord: ReleaseRecord, manifest: Manifest): PublicationState {
  if (manifest.tag === expectedVersion(releaseRecord, manifest.wordlistSha256)) {
    return "new"
  }

  const last = releaseRecord.lastRelease
  const sameVersion = last?.edition === manifest.edition && last.revision === manifest.revision
  if (sameVersion && last?.wordlistSha256 === manifest.wordlistSha256) {
    return "recorded"
  }

  throw new Error("Bundle version does not follow the last published release")
}

export function classifyGitState(
  manifest: Manifest,
  publicationState: PublicationState,
  snapshot: GitSnapshot,
): GitState {
  if (snapshot.branch !== "main") {
    throw new Error("Publication requires the main branch")
  }

  const origin = snapshot.origin.replace(/\.git$/, "")
  if (!repositoryOrigins.includes(origin)) {
    throw new Error("Git origin does not match the release repository")
  }

  const atSourceCommit = snapshot.head === manifest.source.commit && snapshot.remote === snapshot.head
  if (publicationState === "new" && atSourceCommit && snapshot.status === "") {
    return "unrecorded"
  }

  if (publicationState === "recorded") {
    if (atSourceCommit && snapshot.status === `M ${releaseRecordPath}`) {
      return "recorded-uncommitted"
    }

    const releaseRecordCommit = snapshot.status === "" && snapshot.head !== manifest.source.commit
      && snapshot.previous === manifest.source.commit
      && snapshot.subject === `record dictionary release ${manifest.tag}`
      && snapshot.changedFiles === releaseRecordPath
    if (releaseRecordCommit) {
      if (snapshot.remote === snapshot.head) {
        return "complete"
      }
      if (snapshot.remote === manifest.source.commit) {
        return "recorded-unpushed"
      }
    }

    if (snapshot.status === "" && snapshot.remote === snapshot.head) {
      return "complete"
    }
  }

  throw new Error(
    "Git state is not ready for publication. Commit and push source changes before building the bundle, "
      + "or resolve an interrupted release record update.",
  )
}

async function prepareGit(root: string, manifest: Manifest, publicationState: PublicationState): Promise<GitState> {
  const head = await git(root, "rev-parse", "HEAD")
  const statusOutput = await git(root, "status", "--porcelain", "--untracked-files=normal")
  const status = statusOutput
    .split("\n")
    .map((line) => line.trimStart())
    .filter((line) => line !== "" && line !== "?? data/dictionary/.publish.lock")
    .join("\n")
  const remoteOutput = await git(root, "ls-remote", "origin", "refs/heads/main")

  const snapshot: GitSnapshot = {
    branch: await git(root, "branch", "--show-current"),
    origin: await git(root, "remote", "get-url", "origin"),
    head,
    remote: remoteOutput.split(/\s+/)[0],
    status,
  }
  if (publicationState === "recorded" && head !== manifest.source.commit && status === "") {
    snapshot.previous = await git(root, "rev-parse", "HEAD^")
    snapshot.subject = await git(root, "log", "-1", "--format=%s")
    snapshot.changedFiles = await git(root, "show", "--format=", "--name-only", "HEAD")
  }

  return classifyGitState(manifest, publicationState, snapshot)
}

async function commitAndPushReleaseRecord(root: string, manifest: Manifest, gitState: GitState): Promise<void> {
  if (gitState === "unrecorded" || gitState === "recorded-uncommitted") {
    await git(root, "commit", "--only", "-m", `record dictionary release ${manifest.tag}`, "--", releaseRecordPath)
  }

  if (gitState !== "complete") {
    try {
      await git(root, "push", "origin", "HEAD:refs/heads/main")
    } catch (error) {
      throw new Error(
        "Release and record commit exist, but git push failed. Resolve the remote branch and rerun this script.",
        { cause: error },
      )
    }
  }
}

export async function verifyLocalBundle(
  root: string,
  manifest: Manifest,
  publicationState: PublicationState,
  manifestBytes: Buffer,
): Promise<void> {
  const output = join(root, "data/dictionary/output")
  const present = (await readdir(output)).sort()
  const expectedFiles = [...assetNames, releaseNotesName].sort()
  if (present.join("\n") !== expectedFiles.join("\n")) {
    throw new Error("The output directory contains missing or unexpected files")
  }

  for (const artifact of manifest.artifacts) {
    if (sha256(await readFile(join(output, artifact.name))) !== artifact.sha256) {
      throw new Error(`Artifact checksum mismatch: ${artifact.name}`)
    }
  }
  if (sha256(await readFile(join(output, "release.json"))) !== sha256(manifestBytes)) {
    throw new Error("Release manifest changed during verification")
  }

  for (const source of manifest.source.files) {
    if (publicationState === "recorded" && source.path === releaseRecordPath) {
      continue
    }
    if (sha256(await readFile(join(root, source.path))) !== source.sha256) {
      throw new Error(`Source checksum mismatch: ${source.path}. Check or rebuild the bundle.`)
    }
  }

  const csv = await readFile(join(output, dictionaryBasename + ".csv"))
  const records = parse(csv, { bom: true, skip_empty_lines: true }) as string[][]
  if (wordlistFingerprint(records) !== manifest.wordlistSha256) {
    throw new Error("Wordlist fingerprint mismatch")
  }
}

export function renderReleaseNotes(text: string, manifest: Manifest, manifestBytes: Buffer): string {
  const notes = text.replace(/\r\n/g, "\n").trim()
  if (notes === "") {
    throw new Error("release-notes.md must contain a description of the release")
  }

  return [
    notes,
    "",
    "<!--",
    `Manifest SHA-256: ${sha256(manifestBytes)}`,
    `Source commit: ${manifest.source.commit}`,
    "-->",
  ].join("\n")
}

async function remoteReleases(): Promise<RemoteRelease[]> {
  const json = await gh("api", "--paginate", "--slurp", `repos/${repository}/releases?per_page=100`)
  const pages = JSON.parse(json) as RemoteRelease[][]
  return pages.flat()
}

function readReleaseVersion(tag: string): ReleaseVersion | undefined {
  const match = /^ed([1-9]\d*)-rev([1-9]\d*)$/.exec(tag)
  if (!match) {
    return undefined
  }

  const edition = Number(match[1])
  const revision = Number(match[2])
  if (!Number.isSafeInteger(edition) || !Number.isSafeInteger(revision)) {
    throw new Error(`Unsupported GitHub dictionary release tag: ${tag}`)
  }

  return { edition, revision }
}

function latestDictionaryRelease(releases: RemoteRelease[]): RemoteRelease | undefined {
  let latest: RemoteRelease | undefined
  let latestVersion: ReleaseVersion | undefined
  for (const release of releases) {
    const version = readReleaseVersion(release.tag_name)
    if (!version) {
      continue
    }

    const newerEdition = !latestVersion || version.edition > latestVersion.edition
    const newerRevision = version.edition === latestVersion?.edition && version.revision > latestVersion.revision
    if (newerEdition || newerRevision) {
      latest = release
      latestVersion = version
    }
  }

  return latest
}

export function findMatchingRelease(
  releaseRecord: ReleaseRecord,
  manifest: Manifest,
  releases: RemoteRelease[],
): RemoteRelease | undefined {
  const candidate = releases.find((release) => release.tag_name === manifest.tag)
  if (candidate?.draft) {
    throw new Error(
      `GitHub release ${manifest.tag} is an incomplete draft. `
        + "Delete the draft and its tag manually before retrying.",
    )
  }

  const recordedTag = releaseRecord.lastRelease ? releaseTag(releaseRecord.lastRelease) : undefined
  if (recordedTag) {
    const recorded = releases.find((release) => release.tag_name === recordedTag)
    if (!recorded || recorded.draft) {
      throw new Error(`Published release ${recordedTag} is missing from GitHub`)
    }
  }

  const previousReleases = recordedTag === manifest.tag
    ? releases
    : releases.filter((release) => release.tag_name !== manifest.tag)
  const latest = latestDictionaryRelease(previousReleases)
  if (latest?.tag_name !== recordedTag) {
    throw new Error("The latest GitHub dictionary release disagrees with the local release record")
  }

  return candidate
}

async function verifyRemoteBundle(
  manifest: Manifest,
  manifestBytes: Buffer,
  release: RemoteRelease,
  notes: string,
): Promise<void> {
  if (release.body?.replace(/\r\n/g, "\n").trim() !== notes) {
    throw new Error(`GitHub release ${manifest.tag} has different release notes`)
  }

  const names = release.assets
    .map((asset) => asset.name)
    .sort()
    .join("\n")
  if (names !== [...assetNames].sort().join("\n")) {
    throw new Error(`GitHub release ${manifest.tag} has missing or unexpected assets`)
  }

  const directory = await mkdtemp(join(tmpdir(), "russian-diceware-release-"))
  try {
    await gh("release", "download", manifest.tag, "--repo", repository, "--dir", directory)
    const expected = new Map(manifest.artifacts.map((artifact) => [artifact.name, artifact.sha256]))
    expected.set("release.json", sha256(manifestBytes))
    for (const [name, checksum] of expected) {
      if (sha256(await readFile(join(directory, name))) !== checksum) {
        throw new Error(`GitHub asset checksum mismatch: ${name}`)
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function verifyLastRecordedRelease(
  releaseRecord: ReleaseRecord,
  currentTag: string,
  releases: RemoteRelease[],
): Promise<void> {
  const entry = releaseRecord.lastRelease
  if (!entry || releaseTag(entry) === currentTag) {
    return
  }

  const tag = releaseTag(entry)
  const release = releases.find((item) => item.tag_name === tag)
  if (!release?.assets.some((asset) => asset.name === "release.json")) {
    throw new Error(`GitHub release ${tag} is missing release.json`)
  }

  const directory = await mkdtemp(join(tmpdir(), "russian-diceware-last-release-"))
  try {
    await gh("release", "download", tag, "--repo", repository, "--pattern", "release.json", "--dir", directory)
    const bytes = await readFile(join(directory, "release.json"))
    const remote = JSON.parse(bytes.toString("utf8")) as { tag?: string, wordlistSha256?: string }
    const validFingerprint = remote.wordlistSha256 === entry.wordlistSha256
    const validManifest = release.body?.includes(`Manifest SHA-256: ${sha256(bytes)}`) === true
    if (remote.tag !== tag || !validFingerprint || !validManifest) {
      throw new Error(`GitHub release ${tag} disagrees with the local release record`)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function verifyRemoteTag(manifest: Manifest): Promise<void> {
  const json = await gh("api", `repos/${repository}/git/ref/tags/${manifest.tag}`)
  const reference = JSON.parse(json) as { object?: { type?: string, sha?: string } }
  let object = reference.object
  if (object?.type === "tag" && object.sha) {
    const annotatedJson = await gh("api", `repos/${repository}/git/tags/${object.sha}`)
    const annotated = JSON.parse(annotatedJson) as { object?: { type?: string, sha?: string } }
    object = annotated.object
  }

  if (object?.type !== "commit" || object.sha !== manifest.source.commit) {
    throw new Error(`Git tag ${manifest.tag} does not point to the bundle source commit`)
  }
}

async function recordRelease(root: string, manifest: Manifest, original: Buffer): Promise<void> {
  const path = join(root, releaseRecordPath)
  if (sha256(await readFile(path)) !== sha256(original)) {
    throw new Error("Release record changed during publication. GitHub release may already be published.")
  }

  const temporary = path + `.tmp-${process.pid}`
  const updated: ReleaseRecord = {
    lastRelease: {
      edition: manifest.edition,
      revision: manifest.revision,
      wordlistSha256: manifest.wordlistSha256,
    },
  }
  try {
    await writeFile(temporary, JSON.stringify(updated, null, 2) + "\n", { flag: "wx" })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function createGitHubRelease(root: string, manifest: Manifest, notes: string): Promise<void> {
  const ref = await gh("api", `repos/${repository}/git/ref/tags/${manifest.tag}`)
    .catch((error: unknown) => {
      const cause = (error as Error).cause as { stderr?: string, message?: string } | undefined
      const details = `${cause?.stderr ?? ""}\n${cause?.message ?? ""}`
      if (details.includes("HTTP 404")) {
        return ""
      }
      throw error
    })
  if (ref) {
    throw new Error(`Git tag ${manifest.tag} already exists without a release`)
  }

  await gh(
    "api", "--method", "POST", `repos/${repository}/git/refs`,
    "--raw-field", `ref=refs/tags/${manifest.tag}`,
    "--raw-field", `sha=${manifest.source.commit}`,
  )
  await gh(
    "release", "create", manifest.tag,
    ...assetNames.map((name) => join(root, "data/dictionary/output", name)),
    "--repo", repository, "--verify-tag",
    "--title", `Russian Diceware 4d6 ${manifest.tag}`, "--notes", notes,
  )
}

export async function publishRelease(root: string): Promise<PublicationResult> {
  const lockPath = join(root, "data/dictionary/.publish.lock")
  const lock = await open(lockPath, "wx")
  try {
    const output = join(root, "data/dictionary/output")
    const manifestBytes = await readFile(join(output, "release.json"))
    const manifest = readManifest(manifestBytes.toString("utf8"))
    const releaseRecordBytes = await readFile(join(root, releaseRecordPath))
    const releaseRecord = readReleaseRecord(releaseRecordBytes.toString("utf8"))
    const notesText = await readFile(join(output, releaseNotesName), "utf8")
    const notes = renderReleaseNotes(notesText, manifest, manifestBytes)

    const publicationState = getPublicationState(releaseRecord, manifest)
    await verifyLocalBundle(root, manifest, publicationState, manifestBytes)
    const gitState = await prepareGit(root, manifest, publicationState)

    const releases = await remoteReleases()
    let release = findMatchingRelease(releaseRecord, manifest, releases)
    const alreadyPublished = release !== undefined
    await verifyLastRecordedRelease(releaseRecord, manifest.tag, releases)
    if (publicationState === "recorded" && !release) {
      throw new Error("Recorded release is missing from GitHub")
    }

    if (!release) {
      await createGitHubRelease(root, manifest, notes)
      release = findMatchingRelease(releaseRecord, manifest, await remoteReleases())
      if (!release) {
        throw new Error("GitHub release was not found after creation")
      }
    }
    await verifyRemoteBundle(manifest, manifestBytes, release, notes)
    await verifyRemoteTag(manifest)

    if (publicationState === "new") {
      await recordRelease(root, manifest, releaseRecordBytes)
    }
    await commitAndPushReleaseRecord(root, manifest, gitState)

    if (publicationState === "recorded") {
      return "recorded"
    }
    return alreadyPublished ? "reconciled" : "published"
  } finally {
    await lock.close()
    await rm(lockPath, { force: true })
  }
}

const scriptPath = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const root = resolve(dirname(scriptPath), "../..")
  console.log(`Release state: ${await publishRelease(root)}`)
}
