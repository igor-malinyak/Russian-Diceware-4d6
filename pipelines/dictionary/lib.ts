import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

export type ReleaseVersion = {
  edition: number
  revision: number
}

export type PublishedRelease = ReleaseVersion & { wordlistSha256: string }
export type ReleaseRecord = { lastRelease: PublishedRelease | null }
export const dictionaryBasename = "russian-diceware-4d6"

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

export function releaseTag(version: ReleaseVersion): string {
  return `ed${version.edition}-rev${version.revision}`
}

export function wordlistFingerprint(records: string[][]): string {
  return sha256(JSON.stringify(records))
}

export function readReleaseRecord(json: string): ReleaseRecord {
  const value = JSON.parse(json)
  if (value?.lastRelease === undefined) {
    throw new Error("Unknown release record format")
  }

  const entry = value.lastRelease
  if (entry === null) {
    return { lastRelease: null }
  }

  const validEdition = Number.isSafeInteger(entry.edition) && entry.edition > 0
  const validRevision = Number.isSafeInteger(entry.revision) && entry.revision > 0
  const validFingerprint = typeof entry.wordlistSha256 === "string" && /^[a-f0-9]{64}$/.test(entry.wordlistSha256)
  if (!validEdition || !validRevision || !validFingerprint) {
    throw new Error("Invalid release record")
  }

  return { lastRelease: entry as PublishedRelease }
}

export function nextVersion(previous: PublishedRelease, wordlistSha256: string): ReleaseVersion {
  const version = previous.wordlistSha256 === wordlistSha256
    ? { edition: previous.edition, revision: previous.revision + 1 }
    : { edition: previous.edition + 1, revision: 1 }
  if (!Number.isSafeInteger(version.edition) || !Number.isSafeInteger(version.revision)) {
    throw new Error("Release number exceeds the supported range")
  }
  return version
}

export async function describeArtifact(directory: string, name: string) {
  const bytes = await readFile(join(directory, name))
  return { name, sha256: sha256(bytes) }
}
