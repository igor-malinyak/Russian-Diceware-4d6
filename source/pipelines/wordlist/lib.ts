import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(LIB_DIR, '../../..');
const DATA_ROOT = path.join(PROJECT_ROOT, 'source', 'data');
const SELECTION_DIR = path.join(DATA_ROOT, 'selection');
const WORDLIST_DIR = path.join(DATA_ROOT, 'wordlist');

export const ARTIFACTS = {
  finalCandidatesSelected: path.join(SELECTION_DIR, 'final-candidates-selected.csv'),
  selectedWords: path.join(WORDLIST_DIR, 'selected-words.csv'),
  editedWords: path.join(WORDLIST_DIR, 'edited-words.csv'),
  wordMetadataInput: path.join(WORDLIST_DIR, 'word-metadata-input.csv'),
} as const;

const TRANSLITERATION_BY_LETTER: Readonly<Record<string, string>> = {
  'а': 'a',
  'б': 'b',
  'в': 'v',
  'г': 'g',
  'д': 'd',
  'е': 'e',
  'ё': 'yo',
  'ж': 'zh',
  'з': 'z',
  'и': 'i',
  'й': 'y',
  'к': 'k',
  'л': 'l',
  'м': 'm',
  'н': 'n',
  'о': 'o',
  'п': 'p',
  'р': 'r',
  'с': 's',
  'т': 't',
  'у': 'u',
  'ф': 'f',
  'х': 'h',
  'ц': 'ts',
  'ч': 'ch',
  'ш': 'sh',
  'щ': 'shch',
  'ь': '',
  'ы': 'y',
  'ъ': '',
  'э': 'e',
  'ю': 'yu',
  'я': 'ya',
};

export function transliterate(word: string): string {
  const letters = [...word.normalize('NFC')];
  let result = '';

  for (let index = 0; index < letters.length; index += 1) {
    const letter = letters[index];
    const previousLetter = letters[index - 1];

    if (letter === 'е' && (previousLetter === 'ь' || previousLetter === 'ъ')) {
      result += 'ye';
      continue;
    }

    const replacement = TRANSLITERATION_BY_LETTER[letter];
    if (replacement === undefined) {
      throw new Error(`Unsupported character "${letter}" in word "${word}"`);
    }

    result += replacement;
  }

  return result;
}

export function readCsvRows(filePath: string): { header: string[]; rows: string[][] } {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing input file: ${relativeProjectPath(filePath)}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    throw new Error(`Empty CSV file: ${relativeProjectPath(filePath)}`);
  }

  const records = parseCsv(content, { bom: true }) as string[][];
  return {
    header: records[0] || [],
    rows: records.slice(1).filter((row) => row.some((value) => value !== '')),
  };
}

export function writeCsv(filePath: string, header: string[], rows: string[][]): void {
  fs.writeFileSync(filePath, stringifyCsv([header, ...rows]), 'utf8');
}

export function ensureWordlistDir(): void {
  fs.mkdirSync(WORDLIST_DIR, { recursive: true });
}

export function requireColumnIndex(
  header: string[],
  columnName: string,
  filePath: string,
): number {
  const index = header.indexOf(columnName);
  if (index === -1) {
    throw new Error(`Expected ${columnName} column in ${relativeProjectPath(filePath)}`);
  }

  return index;
}

export function relativeProjectPath(filePath: string): string {
  return path.relative(PROJECT_ROOT, filePath);
}
