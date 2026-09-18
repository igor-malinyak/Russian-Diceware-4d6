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

type RankingScoreInputs = {
  lemmaIpm: number;
  rootIpm: number;
  imageability: number;
  emotionalValence: number;
  isProfane: number;
};

function imageabilityBonus(imageability: number): number {
  switch (imageability) {
    case 5:
      return 400;
    case 4:
      return 200;
    default:
      return 0;
  }
}

function reducedFactor(value: number): number {
  switch (value) {
    case 1:
      return 0.25;
    case 2:
      return 0.5;
    default:
      return 1;
  }
}

function profanityFactor(isProfane: number): number {
  return isProfane === 0 ? 1 : 0;
}

function lengthFactor(length: number): number {
  switch (length) {
    case 2:
    case 3:
      return 4.5;
    case 4:
      return 4;
    case 5:
      return 3.5;
    case 6:
      return 3;
    case 7:
      return 2.5;
    case 8:
      return 2;
    case 9:
      return 1.75;
    case 10:
      return 1.5;
    case 11:
      return 1.25;
    case 12:
      return 1;
    default:
      return 0;
  }
}

export function computeFinalRankingScore(inputs: RankingScoreInputs): number {
  const avgIpm = Math.sqrt(inputs.lemmaIpm * inputs.rootIpm);
  const score = (
    (avgIpm + imageabilityBonus(inputs.imageability)) *
    reducedFactor(inputs.imageability) *
    reducedFactor(inputs.emotionalValence) *
    profanityFactor(inputs.isProfane)
  );

  if (!Number.isFinite(score)) {
    throw new Error('Final ranking score is not finite');
  }

  return score;
}

export function computeRankingScore(
  inputs: RankingScoreInputs,
  lemmaLength: number,
): number {
  const score = computeFinalRankingScore(inputs) * lengthFactor(lemmaLength);

  if (!Number.isFinite(score)) {
    throw new Error('Ranking score is not finite');
  }

  return score;
}

export function formatRankingScore(value: number): string {
  return value.toFixed(6).replace(/(?:\.0+|(\.\d*?)0+)$/u, '$1');
}

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
