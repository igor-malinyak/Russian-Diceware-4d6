import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { readWordlist, renderVersion, renderRows } from "./01-build-dictionary.ts"

describe("readWordlist", () => {
  test("preserves columns, values, order, leading zeros, and empty cells in TSV", () => {
    const csv = Buffer.from(
      'Dices,Word,Transliteration,Abbreviation,Numeric code\n'
        + '1111,"a,b","a\tb",ab,001\n1112,"a\nb",ab,,\n',
    )
    const output = readWordlist(csv)
    assert.equal(
      output.tsv,
      "Dices\tWord\tTransliteration\tAbbreviation\tNumeric code\n"
        + '1111\ta,b\t"a\tb"\tab\t001\n'
        + '1112\t"a\nb"\tab\t\t\n',
    )
  })
})

describe("renderVersion", () => {
  test("renders edition and revision separately from the document layout", () => {
    const tex = renderVersion({ edition: 12, revision: 3 })
    assert.ok(tex.includes("\\newcommand{\\DictionaryEdition}{12}"))
    assert.ok(tex.includes("\\newcommand{\\DictionaryRevision}{3}"))
  })
})

describe("renderRows", () => {
  test("renders dictionary rows and section bookmarks", () => {
    const csv = Buffer.from(
      "Dices,Word,Transliteration,Abbreviation,Numeric code\n"
        + '1111,аист,aist,ast,001\n1112,"арбуз&дыня",arbuz,arb,002\n2111,бобр,bobr,bbr,003\n',
    )
    const rows = readWordlist(csv).rows
    assert.equal(
      renderRows(rows),
      "\\TableDataRow[{\\pdfbookmark[1]{⚀⚀⚀⚀ аист}{dictionary-1111}}]{1111}{аист}{aist}{ast}{001}\n"
        + "\\TableDataRow{1112}{арбуз\\&дыня}{arbuz}{arb}{002}\n"
        + "\\TableDataRow[{\\pdfbookmark[1]{⚁⚀⚀⚀ бобр}{dictionary-2111}}]{2111}{бобр}{bobr}{bbr}{003}",
    )
  })
})
