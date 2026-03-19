import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(LIB_DIR, '../..');
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const ROOTS_DIR = path.join(DATA_ROOT, 'roots');
const ATTRIBUTES_DIR = path.join(DATA_ROOT, 'attributes');

export const ATTRIBUTE_COLUMNS = [
  'imageability',
  'emotional_valence',
  'is_profane',
] as const;

export const ARTIFACTS = {
  dictionarySourceWithRoots: path.join(ROOTS_DIR, 'dictionary-source-with-roots.csv'),
  rootIpm: path.join(ROOTS_DIR, 'root-ipm.csv'),
  dictionaryTop: path.join(ATTRIBUTES_DIR, 'dictionary-top.csv'),
  llmAttributesOriginal: path.join(ATTRIBUTES_DIR, 'llm-attributes.original.csv'),
  llmAttributesLlm: path.join(ATTRIBUTES_DIR, 'llm-attributes.llm.csv'),
  dictionaryTopWithAttributes: path.join(ATTRIBUTES_DIR, 'dictionary-top-with-attributes.csv'),
} as const;

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

export function ensureAttributesDir(): void {
  fs.mkdirSync(path.dirname(ARTIFACTS.dictionaryTop), { recursive: true });
}

export function orderedUnique(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

export function rootBase(root: string): string {
  return root.replace(/-\d+$/u, '');
}

export function requireColumnIndex(header: string[], columnName: string, filePath: string): number {
  const index = header.indexOf(columnName);
  if (index === -1) {
    throw new Error(`Expected ${columnName} column in ${relativeProjectPath(filePath)}`);
  }

  return index;
}

function relativeProjectPath(filePath: string): string {
  return path.relative(PROJECT_ROOT, filePath);
}
