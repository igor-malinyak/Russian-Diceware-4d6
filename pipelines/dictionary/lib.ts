import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

export type ReleaseVersion = {
  edition: number
  revision: number
}

export type PublishedRelease = ReleaseVersion & { wordlistSha256: string }
export type ReleaseRegistry = { releases: PublishedRelease[] }
export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

export function releaseTag(version: ReleaseVersion): string {
  return `ed${version.edition}-rev${version.revision}`
}

export function wordlistFingerprint(records: string[][]): string {
  return sha256(JSON.stringify(records))
}

export function readRegistry(json: string): ReleaseRegistry {
  const value = JSON.parse(json)
  if (!Array.isArray(value?.releases)) {
    throw new Error("Unknown release registry format")
  }
  let previous: PublishedRelease | undefined
  for (const entry of value.releases) {
    if (!entry || !Number.isSafeInteger(entry.edition) || entry.edition < 1 ||
        !Number.isSafeInteger(entry.revision) || entry.revision < 1 ||
        typeof entry.wordlistSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.wordlistSha256)) {
      throw new Error("Invalid release registry entry")
    }
    const expected = previous ? nextVersion(previous, entry.wordlistSha256) : { edition: 1, revision: 1 }
    if (entry.edition !== expected.edition || entry.revision !== expected.revision) {
      throw new Error("Release registry editions or revisions are out of sequence")
    }
    previous = entry
  }
  return value as ReleaseRegistry
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
