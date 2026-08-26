import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(LIB_DIR, '../..');
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const ATTRIBUTES_DIR = path.join(DATA_ROOT, 'attributes');
const ROOTS_DIR = path.join(DATA_ROOT, 'roots');
const SELECTION_DIR = path.join(DATA_ROOT, 'selection');

export const ARTIFACTS = {
  dictionarySourceWithRoots: path.join(ROOTS_DIR, 'dictionary-source-with-roots.csv'),
  dictionaryTopWithAttributes: path.join(ATTRIBUTES_DIR, 'dictionary-top-with-attributes.csv'),
  extraLemmasWithAttributes: path.join(ATTRIBUTES_DIR, 'extra-lemmas-with-attributes.csv'),
  dictionaryTopRanked: path.join(SELECTION_DIR, 'dictionary-top-ranked.csv'),
  extraLemmasRanked: path.join(SELECTION_DIR, 'extra-lemmas-ranked.csv'),
  manualSelection: path.join(SELECTION_DIR, 'manual-selection.csv'),
  manualSelectionCompleted: path.join(SELECTION_DIR, 'manual-selection-completed.csv'),
  finalCandidatesRanked: path.join(SELECTION_DIR, 'final-candidates-ranked.csv'),
} as const;

const SELECTED_MARK = 'x';

type CandidateColumnGroup = {
  selection: number;
  lemma: number;
};

export type ManualSelection = {
  selectedFromCandidateColumns: string[];
  selectedFromExtra: string[];
  uniqueSelected: string[];
};

export function readCsvRows(filePath: string): { header: string[]; rows: string[][] } {
  if (!fs.existsSync(filePath)) {
    return { header: [], rows: [] };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    return { header: [], rows: [] };
  }

  const records = parseCsv(content) as string[][];
  return {
    header: records[0] || [],
    rows: records.slice(1).filter((row) => row.some((value) => value !== '')),
  };
}

export function writeCsv(filePath: string, header: string[], rows: string[][]): void {
  fs.writeFileSync(filePath, stringifyCsv([header, ...rows]), 'utf8');
}

export function ensureSelectionDir(): void {
  fs.mkdirSync(SELECTION_DIR, { recursive: true });
}

export function requireColumnIndex(header: string[], columnName: string, filePath: string): number {
  const index = header.indexOf(columnName);
  if (index === -1) {
    throw new Error(`Expected ${columnName} column in ${relativeProjectPath(filePath)}`);
  }

  return index;
}

function loadCandidateColumnGroups(
  header: string[],
  filePath: string,
): CandidateColumnGroup[] {
  const groups: CandidateColumnGroup[] = [];

  for (let index = 0; index < header.length; index += 1) {
    if (header[index] !== 'S') {
      continue;
    }

    if (header[index + 1] !== 'Lemma') {
      throw new Error(
        `Expected Lemma column right after S at column ${index + 1} in ${relativeProjectPath(filePath)}`,
      );
    }

    groups.push({
      selection: index,
      lemma: index + 1,
    });
  }

  if (groups.length === 0) {
    throw new Error(
      `Expected at least one S/Lemma column pair in ${relativeProjectPath(filePath)}`,
    );
  }

  return groups;
}

function parseExtraCandidates(value: string | undefined): string[] {
  return (value || '')
    .split(/[,\n]/u)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate !== '');
}

export function readManualSelection(filePath: string): ManualSelection {
  const { header, rows } = readCsvRows(filePath);
  const candidateColumnGroups = loadCandidateColumnGroups(header, filePath);
  const extraColumnIndex = requireColumnIndex(header, 'Extra', filePath);
  const selectedFromCandidateColumns: string[] = [];

  for (const row of rows) {
    for (const group of candidateColumnGroups) {
      if ((row[group.selection] || '').trim().toLowerCase() !== SELECTED_MARK) {
        continue;
      }

      const lemma = (row[group.lemma] || '').trim();
      if (!lemma) {
        throw new Error(
          `Found selected S mark without a lemma in ${relativeProjectPath(filePath)}`,
        );
      }

      selectedFromCandidateColumns.push(lemma);
    }
  }

  const selectedFromExtra = rows.flatMap((row) =>
    parseExtraCandidates(row[extraColumnIndex]),
  );

  return {
    selectedFromCandidateColumns,
    selectedFromExtra,
    uniqueSelected: [...new Set([
      ...selectedFromCandidateColumns,
      ...selectedFromExtra,
    ])],
  };
}

function relativeProjectPath(filePath: string): string {
  return path.relative(PROJECT_ROOT, filePath);
}
