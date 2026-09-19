import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { parse } from "csv-parse/sync"
import { readRegistry, releaseTag, sha256, wordlistFingerprint } from "./lib.ts"
import { selectVersion } from "./01-build-dictionary.ts"

const hash = sha256("dictionary")
const changed = sha256("changed")
const registry = (releases: unknown[]) => readRegistry(JSON.stringify({ releases }))

describe("selectVersion", () => {
  test("starts at ed1-rev1 when no releases have been published", () => {
    assert.deepEqual(selectVersion(registry([]), hash), { edition: 1, revision: 1 })
  })

  test("increments revision for unchanged data and edition for changed data", () => {
    const published = registry([{ edition: 1, revision: 1, wordlistSha256: hash }])
    assert.equal(releaseTag(selectVersion(published, hash)), "ed1-rev2")
    assert.equal(releaseTag(selectVersion(published, changed)), "ed2-rev1")
  })

  test("does not mutate the registry or increase the version across repeated selections", () => {
    const published = registry([
      { edition: 1, revision: 1, wordlistSha256: hash },
      { edition: 1, revision: 2, wordlistSha256: hash },
      { edition: 2, revision: 1, wordlistSha256: changed },
    ])
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

describe("readRegistry", () => {
  test("rejects malformed or inconsistent release histories", () => {
    assert.throws(() => readRegistry("{}"))
    for (const releases of [
      [{ edition: 0, revision: 1, wordlistSha256: hash }],
      [{ edition: 1, revision: 1, wordlistSha256: "broken" }],
      [{ edition: 1, revision: 2, wordlistSha256: hash }],
      [{ edition: 1, revision: 1, wordlistSha256: hash }, { edition: 1, revision: 2, wordlistSha256: changed }],
      [{ edition: 1, revision: 1, wordlistSha256: hash }, { edition: 2, revision: 1, wordlistSha256: hash }],
    ]) {
      assert.throws(() => registry(releases))
    }
  })
})
