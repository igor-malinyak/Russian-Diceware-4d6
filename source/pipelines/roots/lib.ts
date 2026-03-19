import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify as stringifyCsv } from 'csv-stringify/sync';

type PartOfSpeech = 's' | 'a' | 'v' | 'adv';

type DictionaryRow = {
  columns: string[];
  number: string;
  lemma: string;
  pos: PartOfSpeech;
  ipm: number;
};

type KuznetsovaEntry = {
  lemma: string;
  lemmaWithNote: string;
  root: string;
};

type AutoTikhonovResolution = {
  autoCandidates: string[];
  resolutionKind:
    | 'deterministic'
    | 'homonym'
    | 'needs_root_mapping'
    | 'lemma_level_conflict';
  resolvedRoot: string;
  resolvedCanonicalRoot: string;
  homonymCandidates: string[];
  note: string;
};

type RootMappingDecision = {
  decision: 'mapped' | 'new_root' | 'lemma_level_conflict';
  root: string;
};

type KuznetsovaRootInfo = {
  root: string;
  rootBase: string;
  canonicalRoot: string;
  isHomonym: boolean;
  variantNo: string;
  examples: string;
};

type ResolvedRootInfo = {
  root: string;
  rootBase: string;
  canonicalRoot: string;
  source: string;
  examples: string;
};

type BaseState = {
  dictionaryHeader: string[];
  dictionaryRows: DictionaryRow[];
  lemmaToMaxIpm: Map<string, number>;
  kuznetsovaEntries: KuznetsovaEntry[];
  kuznetsovaByLemma: Map<string, KuznetsovaEntry[]>;
  tikhonovByLemma: Map<string, string[]>;
};

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(LIB_DIR, '../..');
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const ROOTS_DIR = path.join(DATA_ROOT, 'roots');
const DICTIONARY_PATH = path.join(ROOTS_DIR, 'dictionary-source.csv');
const KUZNETSOVA_FIXED_PATH = path.join(ROOTS_DIR, 'lemmas_to_roots_fixed.tsv');
const TIKHONOV_PATH = path.join(DATA_ROOT, 'external', 'train_Tikhonov_reformat.txt');

const SUPERSCRIPT_TO_SUFFIX: Record<string, string> = {
  '\u00b9': '-1',
  '\u00b2': '-2',
  '\u00b3': '-3',
  '\u2074': '-4',
  '\u2075': '-5',
  '\u2076': '-6',
};

export const ARTIFACTS = {
  kuznetsovaRoots: path.join(ROOTS_DIR, 'kuznetsova-roots.csv'),
  tikhonovAutoRootResolution: path.join(ROOTS_DIR, 'tikhonov-auto-root-resolution.csv'),
  llmTikhonovRootMappingOriginal: path.join(ROOTS_DIR, 'llm-tikhonov-root-mapping.original.csv'),
  llmTikhonovRootMappingLlm: path.join(ROOTS_DIR, 'llm-tikhonov-root-mapping.llm.csv'),
  resolvedRoots: path.join(ROOTS_DIR, 'resolved-roots.csv'),
  llmTikhonovHomonymOriginal: path.join(
    ROOTS_DIR,
    'llm-tikhonov-homonym-disambiguation.original.csv',
  ),
  llmTikhonovHomonymLlm: path.join(
    ROOTS_DIR,
    'llm-tikhonov-homonym-disambiguation.llm.csv',
  ),
  llmRootsOriginal: path.join(ROOTS_DIR, 'llm-roots.original.csv'),
  llmRootsLlm: path.join(ROOTS_DIR, 'llm-roots.llm.csv'),
  finalDictionary: path.join(ROOTS_DIR, 'dictionary-source-with-roots.csv'),
  rootIpm: path.join(ROOTS_DIR, 'root-ipm.csv'),
} as const;

function normalizeRoot(root: string): string {
  let result = root.trim();
  for (const [source, target] of Object.entries(SUPERSCRIPT_TO_SUFFIX)) {
    result = result.split(source).join(target);
  }
  return result;
}

function stripLemmaNote(lemma: string): string {
  return lemma.replace(/ \([^)]*\)$/u, '').replace(/ \[[^\]]*\]$/u, '');
}

function stripStressMarks(text: string): string {
  return text.replace(/[\u0300\u0301]/gu, '');
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

function parseDictionaryRows(): {
  header: string[];
  rows: DictionaryRow[];
  lemmaToMaxIpm: Map<string, number>;
} {
  const parsed = readCsvRows(DICTIONARY_PATH);
  const rows = parsed.rows.map((record) => {
    const [rowNumber, lemma, pos, ipmRaw] = record;
    return {
      columns: record,
      number: rowNumber,
      lemma,
      pos: pos as PartOfSpeech,
      ipm: Number.isFinite(Number(ipmRaw)) ? Number(ipmRaw) : 0,
    };
  });

  const lemmaToMaxIpm = new Map<string, number>();
  for (const row of rows) {
    lemmaToMaxIpm.set(row.lemma, Math.max(lemmaToMaxIpm.get(row.lemma) || 0, row.ipm));
  }

  return {
    header: parsed.header,
    rows,
    lemmaToMaxIpm,
  };
}

function parseKuznetsovaFixed(): {
  entries: KuznetsovaEntry[];
  byLemma: Map<string, KuznetsovaEntry[]>;
} {
  const records = parseCsv(fs.readFileSync(KUZNETSOVA_FIXED_PATH, 'utf8'), {
    delimiter: '\t',
    relax_column_count: true,
  }) as string[][];

  const entries: KuznetsovaEntry[] = [];
  const byLemma = new Map<string, KuznetsovaEntry[]>();

  for (const record of records) {
    const [lemmaWithNoteRaw = '', rootRaw = ''] = record;
    if (!lemmaWithNoteRaw || !rootRaw) {
      continue;
    }

    const lemmaWithNote = stripStressMarks(lemmaWithNoteRaw.trim());
    const lemma = stripLemmaNote(lemmaWithNote);
    const root = normalizeRoot(rootRaw);
    const entry = { lemma, lemmaWithNote, root };
    entries.push(entry);

    if (!byLemma.has(lemma)) {
      byLemma.set(lemma, []);
    }
    byLemma.get(lemma)?.push(entry);
  }

  return { entries, byLemma };
}

function parseTikhonov(): Map<string, string[]> {
  const byLemma = new Map<string, string[]>();
  const records = parseCsv(fs.readFileSync(TIKHONOV_PATH, 'utf8'), {
    delimiter: '\t',
    relax_column_count: true,
  }) as string[][];

  for (const record of records) {
    const [lemmaRaw = '', segmentation = ''] = record;
    if (!lemmaRaw) {
      continue;
    }
    const lemma = stripStressMarks(lemmaRaw.trim());
    const roots = [...segmentation.matchAll(/(^|\/)([^/:]+):ROOT(?=\/|$)/g)].map(
      (match) => match[2],
    );
    byLemma.set(lemma, roots);
  }

  return byLemma;
}

export function ensureRootsDir(): void {
  fs.mkdirSync(ROOTS_DIR, { recursive: true });
}

export function writeCsv(filePath: string, header: string[], rows: string[][]): void {
  const content = stringifyCsv([header, ...rows]);
  fs.writeFileSync(filePath, content, 'utf8');
}

export function orderedUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
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

export function loadBaseState(): BaseState {
  const dictionary = parseDictionaryRows();
  const kuznetsova = parseKuznetsovaFixed();
  const tikhonovByLemma = parseTikhonov();

  return {
    dictionaryHeader: dictionary.header,
    dictionaryRows: dictionary.rows,
    lemmaToMaxIpm: dictionary.lemmaToMaxIpm,
    kuznetsovaEntries: kuznetsova.entries,
    kuznetsovaByLemma: kuznetsova.byLemma,
    tikhonovByLemma,
  };
}

export function loadKuznetsovaRootsByRoot(): Map<string, KuznetsovaRootInfo> {
  if (!fs.existsSync(ARTIFACTS.kuznetsovaRoots)) {
    throw new Error(
      `Missing ${path.relative(PROJECT_ROOT, ARTIFACTS.kuznetsovaRoots)}. Run step 01 first.`,
    );
  }

  const parsed = readCsvRows(ARTIFACTS.kuznetsovaRoots);
  const indexByName = new Map(parsed.header.map((name, index) => [name, index]));
  const result = new Map<string, KuznetsovaRootInfo>();

  for (const row of parsed.rows) {
    const root = row[indexByName.get('root') || 0];
    result.set(root, {
      root,
      rootBase: row[indexByName.get('root_base') || 0],
      canonicalRoot: row[indexByName.get('canonical_root') || 0],
      isHomonym: row[indexByName.get('is_homonym') || 0] === '1',
      variantNo: row[indexByName.get('variant_no') || 0],
      examples: row[indexByName.get('examples') || 0],
    });
  }

  return result;
}

export function loadAutoTikhonovResolutionMap(): Map<string, AutoTikhonovResolution> {
  if (!fs.existsSync(ARTIFACTS.tikhonovAutoRootResolution)) {
    throw new Error(
      `Missing ${path.relative(PROJECT_ROOT, ARTIFACTS.tikhonovAutoRootResolution)}. Run step 02 first.`,
    );
  }

  const parsed = readCsvRows(ARTIFACTS.tikhonovAutoRootResolution);
  const indexByName = new Map(parsed.header.map((name, index) => [name, index]));
  const result = new Map<string, AutoTikhonovResolution>();

  for (const row of parsed.rows) {
    const resolutionKind = row[indexByName.get('resolution_kind') || 0];
    if (
      resolutionKind !== 'deterministic'
      && resolutionKind !== 'homonym'
      && resolutionKind !== 'needs_root_mapping'
      && resolutionKind !== 'lemma_level_conflict'
    ) {
      throw new Error(`Unsupported auto resolution kind "${resolutionKind}"`);
    }

    const tikhonovRoot = row[indexByName.get('tikhonov_root') || 0];
    result.set(tikhonovRoot, {
      autoCandidates: (row[indexByName.get('auto_candidates') || 0] || '')
        .split('|')
        .filter(Boolean),
      resolutionKind,
      resolvedRoot: row[indexByName.get('resolved_root') || 0],
      resolvedCanonicalRoot: row[indexByName.get('resolved_canonical_root') || 0],
      homonymCandidates: (row[indexByName.get('kuznetsova_homonym_candidates') || 0] || '')
        .split('|')
        .filter(Boolean),
      note: row[indexByName.get('notes') || 0],
    });
  }

  return result;
}

export function loadRootMappingLlmDecisions(): Map<string, RootMappingDecision> {
  if (!fs.existsSync(ARTIFACTS.llmTikhonovRootMappingLlm)) {
    throw new Error(
      `Missing ${path.relative(PROJECT_ROOT, ARTIFACTS.llmTikhonovRootMappingLlm)}. Fill the .llm file first.`,
    );
  }

  const parsed = readCsvRows(ARTIFACTS.llmTikhonovRootMappingLlm);
  const indexByName = new Map(parsed.header.map((name, index) => [name, index]));
  const result = new Map<string, RootMappingDecision>();

  for (const row of parsed.rows) {
    const tikhonovRoot = row[indexByName.get('tikhonov_root') || 0];
    const decision = row[indexByName.get('decision') || 0];
    const root = row[indexByName.get('root') || 0];

    if (!decision) {
      throw new Error(`Incomplete root mapping decision for ${tikhonovRoot}`);
    }
    if (
      decision !== 'mapped'
      && decision !== 'new_root'
      && decision !== 'lemma_level_conflict'
    ) {
      throw new Error(`Unsupported decision "${decision}" for ${tikhonovRoot}`);
    }
    if (decision !== 'lemma_level_conflict' && !root) {
      throw new Error(`Incomplete root mapping decision for ${tikhonovRoot}`);
    }
    if (decision === 'lemma_level_conflict' && root) {
      throw new Error(`Root must stay empty for lemma_level_conflict on ${tikhonovRoot}`);
    }

    result.set(tikhonovRoot, {
      decision,
      root,
    });
  }

  return result;
}

export function loadResolvedRootsByRoot(): Map<string, ResolvedRootInfo> {
  if (!fs.existsSync(ARTIFACTS.resolvedRoots)) {
    throw new Error(
      `Missing ${path.relative(PROJECT_ROOT, ARTIFACTS.resolvedRoots)}. Run step 04 first.`,
    );
  }

  const parsed = readCsvRows(ARTIFACTS.resolvedRoots);
  const indexByName = new Map(parsed.header.map((name, index) => [name, index]));
  const result = new Map<string, ResolvedRootInfo>();

  for (const row of parsed.rows) {
    const root = row[indexByName.get('root') || 0];
    result.set(root, {
      root,
      rootBase: row[indexByName.get('root_base') || 0],
      canonicalRoot: row[indexByName.get('canonical_root') || 0],
      source: row[indexByName.get('source') || 0],
      examples: row[indexByName.get('examples') || 0],
    });
  }

  return result;
}

export function validateLlmArtifact(
  originalPath: string,
  llmPath: string,
  keyColumn: string,
  requiredColumns: string[],
): { rows: number } {
  if (!fs.existsSync(originalPath)) {
    throw new Error(`Missing ${path.relative(PROJECT_ROOT, originalPath)}`);
  }
  if (!fs.existsSync(llmPath)) {
    throw new Error(`Missing ${path.relative(PROJECT_ROOT, llmPath)}`);
  }

  const original = readCsvRows(originalPath);
  const completed = readCsvRows(llmPath);
  const originalKeyIndex = original.header.indexOf(keyColumn);
  const completedKeyIndex = completed.header.indexOf(keyColumn);

  if (originalKeyIndex === -1) {
    throw new Error(`Expected key column ${keyColumn} in ${originalPath}`);
  }
  if (completedKeyIndex === -1) {
    throw new Error(`Expected key column ${keyColumn} in ${llmPath}`);
  }

  const completedIndexByName = new Map(completed.header.map((name, index) => [name, index]));
  for (const column of requiredColumns) {
    if (!completedIndexByName.has(column)) {
      throw new Error(`Expected column ${column} in ${llmPath}`);
    }
  }

  const originalByKey = new Map<string, string[]>();
  const completedByKey = new Map<string, string[]>();

  for (const row of original.rows) {
    originalByKey.set(row[originalKeyIndex], row);
  }
  for (const row of completed.rows) {
    completedByKey.set(row[completedKeyIndex], row);
  }

  if (originalByKey.size !== completedByKey.size) {
    throw new Error(
      `Row count mismatch: ${originalByKey.size} in original vs ${completedByKey.size} in llm`,
    );
  }

  for (const [key, originalRow] of originalByKey.entries()) {
    const completedRow = completedByKey.get(key);
    if (!completedRow) {
      throw new Error(`Missing row for ${key} in ${llmPath}`);
    }

    for (const columnName of original.header) {
      const originalIndex = original.header.indexOf(columnName);
      const completedIndex = completed.header.indexOf(columnName);
      if (completedIndex === -1) {
        throw new Error(`Missing original column ${columnName} in ${llmPath}`);
      }

      const originalValue = originalRow[originalIndex] || '';
      const completedValue = completedRow[completedIndex] || '';
      if (!requiredColumns.includes(columnName) && originalValue !== completedValue) {
        throw new Error(
          `Changed non-LLM column ${columnName} for ${key}: "${originalValue}" -> "${completedValue}"`,
        );
      }
    }

    for (const column of requiredColumns) {
      const index = completedIndexByName.get(column);
      if (index === undefined || !completedRow[index]) {
        throw new Error(`Missing required value in column ${column} for ${key}`);
      }
    }
  }

  return { rows: originalByKey.size };
}
