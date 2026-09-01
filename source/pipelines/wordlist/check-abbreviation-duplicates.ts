import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const DEFAULT_INPUT = path.join(
  PROJECT_ROOT,
  'source/data/wordlist/word-metadata-completed.csv',
);

type CsvRow = Record<string, string>;

type AbbreviationOccurrence = {
  row: number;
  word: string;
};

function loadRows(filePath: string): CsvRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing input file: ${path.relative(PROJECT_ROOT, filePath)}`);
  }

  return parseCsv(fs.readFileSync(filePath, 'utf8'), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as CsvRow[];
}

function requireColumns(rows: CsvRow[], columnNames: string[]): void {
  const header = rows[0] ? Object.keys(rows[0]) : [];
  const missingColumns = columnNames.filter((columnName) => !header.includes(columnName));

  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
  }
}

function findDuplicates(rows: CsvRow[]): Array<{
  abbreviation: string;
  occurrences: AbbreviationOccurrence[];
}> {
  const occurrencesByAbbreviation = new Map<string, AbbreviationOccurrence[]>();

  rows.forEach((row, index) => {
    const abbreviation = row.abbreviation.trim();
    if (!abbreviation) {
      return;
    }

    const occurrences = occurrencesByAbbreviation.get(abbreviation) || [];
    occurrences.push({
      row: index + 2,
      word: row.word.trim(),
    });
    occurrencesByAbbreviation.set(abbreviation, occurrences);
  });

  return [...occurrencesByAbbreviation.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([abbreviation, occurrences]) => ({ abbreviation, occurrences }))
    .sort((left, right) => left.abbreviation.localeCompare(right.abbreviation, 'en'));
}

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT;
const rows = loadRows(inputPath);

requireColumns(rows, ['word', 'abbreviation']);

const duplicates = findDuplicates(rows);

console.log(
  JSON.stringify(
    {
      input: path.relative(PROJECT_ROOT, inputPath),
      populatedAbbreviations: rows.filter((row) => row.abbreviation.trim() !== '').length,
      duplicateAbbreviations: duplicates.length,
      duplicateRows: duplicates.reduce(
        (total, duplicate) => total + duplicate.occurrences.length,
        0,
      ),
      duplicates,
    },
    null,
    2,
  ),
);

if (duplicates.length > 0) {
  process.exitCode = 1;
}
