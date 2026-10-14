import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parse } from "csv-parse/sync"
import { readReleaseRecord, releaseTag, sha256, wordlistFingerprint } from "./lib.ts"
import { selectVersion } from "./01-build-dictionary.ts"

const hash = sha256("dictionary")
const changed = sha256("changed")
const releaseRecord = (lastRelease: unknown) => readReleaseRecord(JSON.stringify({ lastRelease }))

describe("selectVersion", () => {
  test("starts at ed1-rev1 when no releases have been published", () => {
    assert.deepEqual(selectVersion(releaseRecord(null), hash), { edition: 1, revision: 1 })
  })

  test("increments revision for unchanged data and edition for changed data", () => {
    const published = releaseRecord({ edition: 1, revision: 1, wordlistSha256: hash })
    assert.equal(releaseTag(selectVersion(published, hash)), "ed1-rev2")
    assert.equal(releaseTag(selectVersion(published, changed)), "ed2-rev1")
  })

  test("does not mutate the release record or increase the version across repeated selections", () => {
    const published = releaseRecord({ edition: 2, revision: 1, wordlistSha256: changed })
    const before = JSON.stringify(published)
    assert.equal(releaseTag(selectVersion(published, changed)), "ed2-rev2")
    assert.equal(releaseTag(selectVersion(published, changed)), "ed2-rev2")
    assert.equal(JSON.stringify(published), before)
  })
})

describe("wordlistFingerprint", () => {
  test("ignores CSV representation details but detects changed values", () => {
    const first = Buffer.from(
      "Dices,Word,Transliteration,Abbreviation,Numeric code\n1111,ёж,yozh,yzh,001\n",
    )
    const equivalent = Buffer.from(
      '\uFEFF"Dices","Word","Transliteration","Abbreviation","Numeric code"\r\n'
        + '\r\n"1111","ёж","yozh","yzh","001"\r\n',
    )
    const records = (csv: Buffer) => parse(csv, { bom: true, skip_empty_lines: true }) as string[][]
    assert.equal(wordlistFingerprint(records(first)), wordlistFingerprint(records(equivalent)))
    assert.notEqual(sha256(first), sha256(equivalent))
    const changedWord = Buffer.from(first.toString().replace("ёж", "еж"))
    assert.notEqual(wordlistFingerprint(records(first)), wordlistFingerprint(records(changedWord)))
  })
})

describe("readReleaseRecord", () => {
  test("reads only the last release without requiring its history", () => {
    assert.deepEqual(releaseRecord(null), { lastRelease: null })
    const lastRelease = { edition: 12, revision: 8, wordlistSha256: hash }
    assert.deepEqual(releaseRecord(lastRelease), { lastRelease })
  })

  test("rejects missing or malformed last-release records", () => {
    assert.throws(() => readReleaseRecord("{}"))
    assert.throws(() => readReleaseRecord(JSON.stringify({ releases: [] })))
    for (const lastRelease of [
      {},
      [],
      { edition: 0, revision: 1, wordlistSha256: hash },
      { edition: 1, revision: 0, wordlistSha256: hash },
      { edition: 1.5, revision: 1, wordlistSha256: hash },
      { edition: 1, revision: 1, wordlistSha256: "broken" },
    ]) {
      assert.throws(() => releaseRecord(lastRelease))
    }
  })
})
