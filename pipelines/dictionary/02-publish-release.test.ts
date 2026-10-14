import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, test } from "node:test"
import {
  classifyGitState,
  findMatchingRelease,
  getPublicationState,
  readManifest,
  renderReleaseNotes,
  verifyLocalBundle,
} from "./02-publish-release.ts"
import { readReleaseRecord, sha256, wordlistFingerprint } from "./lib.ts"

const hash = sha256("words")
const otherHash = sha256("other words")
const sourcePaths = ["data/wordlist/wordlist.csv", "data/dictionary/last-release.json"]
const manifest = {
  tag: "ed1-rev1",
  edition: 1,
  revision: 1,
  wordlistSha256: hash,
  source: {
    commit: "a".repeat(40),
    files: sourcePaths.map((path) => ({ path, sha256: hash })),
  },
  artifacts: [
    { name: "russian-diceware-4d6.pdf", sha256: hash },
    { name: "russian-diceware-4d6.csv", sha256: hash },
    { name: "russian-diceware-4d6.tsv", sha256: hash },
  ],
}
const releaseRecord = (lastRelease: unknown) => readReleaseRecord(JSON.stringify({ lastRelease }))
const release = (tag_name: string, draft = false) => ({
  tag_name,
  draft,
  body: "",
  assets: [],
})

describe("readManifest", () => {
  test("rejects altered versions, assets, and source paths", () => {
    assert.equal(readManifest(JSON.stringify(manifest)).tag, "ed1-rev1")
    assert.equal(readManifest(JSON.stringify({
      ...manifest,
      source: { ...manifest.source, files: [...manifest.source.files, { path: "data/new-source.txt", sha256: hash }] },
    })).source.files.length, 3)
    assert.throws(() => readManifest(JSON.stringify({ ...manifest, tag: "ed2-rev1" })))
    assert.throws(() => readManifest(JSON.stringify({ ...manifest, artifacts: manifest.artifacts.slice(1) })))
    assert.throws(() => readManifest(JSON.stringify({
      ...manifest,
      source: { ...manifest.source, files: [{ path: "../secret", sha256: hash }] },
    })))
  })

  test("rejects invalid nested structures without reading their fields", () => {
    for (const source of [undefined, null, "source", { commit: manifest.source.commit }]) {
      assert.throws(() => readManifest(JSON.stringify({ ...manifest, source })), /Invalid release manifest/)
    }
    assert.throws(() => readManifest(JSON.stringify({ ...manifest, artifacts: [null] })))
  })
})

describe("verifyLocalBundle", () => {
  test("checks artifact and source bytes before any GitHub operation", async () => {
    const root = await mkdtemp(join(tmpdir(), "dictionary-publish-test-"))
    const csv = "Dices,Word\n1111,слово\n"
    const fingerprint = wordlistFingerprint([["Dices", "Word"], ["1111", "слово"]])
    try {
      for (const path of sourcePaths) {
        await mkdir(dirname(join(root, path)), { recursive: true })
        await writeFile(join(root, path), path === "data/wordlist/wordlist.csv" ? csv : path)
      }
      const output = join(root, "data/dictionary/output")
      await mkdir(output)
      await writeFile(join(output, "release-notes.md"), "First edition")
      const contents = ["pdf bytes", csv, "Dices\tWord\n1111\tслово\n"]
      const names = manifest.artifacts.map((artifact) => artifact.name)
      for (const [index, name] of names.entries()) {
        await writeFile(join(output, name), contents[index])
      }
      const prepared = {
        ...manifest,
        wordlistSha256: fingerprint,
        source: { ...manifest.source, files: sourcePaths.map((path) => ({
          path,
          sha256: sha256(path === "data/wordlist/wordlist.csv" ? csv : path),
        })) },
        artifacts: names.map((name, index) => ({ name, sha256: sha256(contents[index]) })),
      }
      const bytes = Buffer.from(JSON.stringify(prepared))
      await writeFile(join(output, "release.json"), bytes)
      await verifyLocalBundle(root, prepared, "new", bytes)

      await rm(join(output, "release-notes.md"))
      await assert.rejects(verifyLocalBundle(root, prepared, "new", bytes), /missing or unexpected files/)
      await writeFile(join(output, "release-notes.md"), "First edition")

      const releaseRecordFile = join(root, "data/dictionary/last-release.json")
      const recorded = {
        lastRelease: {
          edition: prepared.edition,
          revision: prepared.revision,
          wordlistSha256: prepared.wordlistSha256,
        },
      }
      await writeFile(releaseRecordFile, JSON.stringify(recorded))
      await verifyLocalBundle(root, prepared, "recorded", bytes)
      await assert.rejects(verifyLocalBundle(root, prepared, "new", bytes), /Source checksum mismatch/)
      await writeFile(releaseRecordFile, "data/dictionary/last-release.json")

      await writeFile(join(output, names[0]), "altered")
      await assert.rejects(verifyLocalBundle(root, prepared, "new", bytes), /checksum mismatch/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("renderReleaseNotes", () => {
  test("uses handwritten Markdown and appends hidden bundle metadata", () => {
    const bytes = Buffer.from(JSON.stringify(manifest))
    const text = "# Changes\r\n\r\n- Updated layout.\r\n"
    const notes = renderReleaseNotes(text, manifest, bytes)
    assert.ok(notes.startsWith("# Changes\n\n- Updated layout.\n\n<!--\n"))
    assert.ok(notes.includes(`Manifest SHA-256: ${sha256(bytes)}`))
    assert.ok(notes.endsWith(`Source commit: ${manifest.source.commit}\n-->`))
  })

  test("rejects empty release notes", () => {
    assert.throws(() => renderReleaseNotes(" \n\t", manifest, Buffer.from("{}")), /must contain a description/)
  })
})

describe("getPublicationState", () => {
  test("accepts a new release and an already recorded retry", () => {
    assert.equal(getPublicationState(releaseRecord(null), manifest), "new")
    const published = releaseRecord({ edition: 1, revision: 1, wordlistSha256: hash })
    assert.equal(getPublicationState(published, manifest), "recorded")
  })

  test("rejects stale or skipped versions", () => {
    const first = { edition: 1, revision: 1, wordlistSha256: otherHash }
    assert.throws(() => getPublicationState(releaseRecord(first), manifest))
    assert.throws(() => getPublicationState(releaseRecord(null), { ...manifest, tag: "ed1-rev2", revision: 2 }))
  })

  test("requires the next edition when the wordlist changes", () => {
    const first = { edition: 1, revision: 1, wordlistSha256: otherHash }
    assert.equal(getPublicationState(releaseRecord(first), { ...manifest, tag: "ed2-rev1", edition: 2 }), "new")
    assert.throws(() => getPublicationState(releaseRecord(first), { ...manifest, tag: "ed1-rev2", revision: 2 }))
  })
})

describe("classifyGitState", () => {
  const beforeReleaseRecord = {
    branch: "main",
    origin: "git@github.com:igor-malinyak/Russian-Diceware-4d6.git",
    head: manifest.source.commit,
    remote: manifest.source.commit,
    status: "",
  }

  test("requires clean committed and pushed sources for a new release", () => {
    assert.equal(classifyGitState(manifest, "new", beforeReleaseRecord), "unrecorded")
    assert.throws(() => classifyGitState(manifest, "new", {
      ...beforeReleaseRecord,
      status: "M pipelines/dictionary/lib.ts",
    }))
    assert.throws(() => classifyGitState(manifest, "new", { ...beforeReleaseRecord, remote: "b".repeat(40) }))
  })

  test("recognizes release record write, local commit, and completed push", () => {
    assert.equal(classifyGitState(manifest, "recorded", {
      ...beforeReleaseRecord,
      status: "M data/dictionary/last-release.json",
    }), "recorded-uncommitted")
    const committed = {
      ...beforeReleaseRecord,
      head: "c".repeat(40),
      previous: manifest.source.commit,
      subject: "record dictionary release ed1-rev1",
      changedFiles: "data/dictionary/last-release.json",
    }
    assert.equal(classifyGitState(manifest, "recorded", committed), "recorded-unpushed")
    assert.equal(classifyGitState(manifest, "recorded", { ...committed, remote: committed.head }), "complete")
  })
})

describe("findMatchingRelease", () => {
  test("allows an absent candidate and a published candidate for reconciliation", () => {
    assert.equal(findMatchingRelease(releaseRecord(null), manifest, []), undefined)
    assert.deepEqual(findMatchingRelease(releaseRecord(null), manifest, [release("ed1-rev1")]), release("ed1-rev1"))
  })

  test("blocks drafts, divergent releases, and missing recorded releases", () => {
    assert.throws(
      () => findMatchingRelease(releaseRecord(null), manifest, [release("ed1-rev1", true)]),
      /Delete the draft and its tag/,
    )
    assert.throws(() => findMatchingRelease(releaseRecord(null), manifest, [release("ed2-rev1")]))
    assert.throws(() => findMatchingRelease(
      releaseRecord({ edition: 1, revision: 1, wordlistSha256: hash }),
      { ...manifest, tag: "ed1-rev2", revision: 2 },
      [],
    ))
  })

  test("checks the last recorded release and rejects newer unrecorded versions", () => {
    const first = { edition: 1, revision: 1, wordlistSha256: hash }
    const next = { ...manifest, tag: "ed1-rev2", revision: 2 }
    assert.equal(findMatchingRelease(releaseRecord(first), next, [release("ed1-rev1")]), undefined)
    assert.throws(() => findMatchingRelease(releaseRecord(first), next, [release("ed1-rev1"), release("ed2-rev1")]))
  })

  test("does not require older releases to be stored locally or present on GitHub", () => {
    const last = { edition: 1, revision: 2, wordlistSha256: hash }
    const next = { ...manifest, tag: "ed1-rev3", revision: 3 }
    assert.equal(findMatchingRelease(releaseRecord(last), next, [release("ed1-rev2")]), undefined)
    assert.equal(
      findMatchingRelease(releaseRecord(last), next, [release("ed1-rev2"), release("ed1-rev1")]),
      undefined,
    )
  })

  test("detects stale local records even when the candidate is already published", () => {
    const last = { edition: 1, revision: 1, wordlistSha256: hash }
    const next = { ...manifest, tag: "ed2-rev1", edition: 2, wordlistSha256: otherHash }
    const releases = [release("ed2-rev1"), release("ed1-rev2"), release("ed1-rev1")]
    assert.throws(() => findMatchingRelease(releaseRecord(last), next, releases), /latest GitHub dictionary release/)
  })

  test("uses numeric version order and verifies an already recorded candidate", () => {
    const last = { edition: 1, revision: 10, wordlistSha256: hash }
    const recorded = { ...manifest, tag: "ed1-rev10", revision: 10 }
    const current = release("ed1-rev10")
    assert.equal(findMatchingRelease(releaseRecord(last), recorded, [release("ed1-rev2"), current]), current)
    assert.throws(() => findMatchingRelease(releaseRecord(last), recorded, [current, release("ed2-rev1")]))
  })
})
