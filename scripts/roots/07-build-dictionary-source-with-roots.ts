import * as fs from 'node:fs';
import { parse as parseCsv } from 'csv-parse/sync';

import {
  ARTIFACTS,
  ensureRootsDir,
  loadAutoTikhonovResolutionMap,
  loadBaseState,
  orderedUnique,
  loadResolvedRootsByRoot,
  loadRootMappingLlmDecisions,
  writeCsv,
} from './lib.ts';

function parseRootsList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadCompletedLlmRows(
  llmPath: string,
  keyColumn: string,
): { header: string[]; rowsByKey: Map<string, string[]> } {
  if (!fs.existsSync(llmPath)) {
    throw new Error(`Missing ${llmPath}. Fill the corresponding .llm.csv file first.`);
  }

  const content = fs.readFileSync(llmPath, 'utf8');
  const records = parseCsv(content) as string[][];
  const header = records[0] || [];
  const rows = records.slice(1).filter((row) => row.some((value) => value !== ''));
  const keyIndex = header.indexOf(keyColumn);
  if (keyIndex === -1) {
    throw new Error(`Expected key column ${keyColumn} in ${llmPath}`);
  }

  const rowsByKey = new Map<string, string[]>();
  for (const row of rows) {
    rowsByKey.set(row[keyIndex], row);
  }

  return { header, rowsByKey };
}

const state = loadBaseState();
const autoResolutionByRoot = loadAutoTikhonovResolutionMap();
const rootMappingDecisions = loadRootMappingLlmDecisions();
const resolvedRootsByRoot = loadResolvedRootsByRoot();

const completedHomonym = loadCompletedLlmRows(
  ARTIFACTS.llmTikhonovHomonymLlm,
  'Number',
);
const completedLlmRoots = loadCompletedLlmRows(
  ARTIFACTS.llmRootsLlm,
  'Number',
);

const homonymRootsIndex = completedHomonym.header.indexOf('roots');
const llmRootsIndex = completedLlmRoots.header.indexOf('roots');

if (homonymRootsIndex === -1) {
  throw new Error(`Expected roots column in ${ARTIFACTS.llmTikhonovHomonymLlm}`);
}
if (llmRootsIndex === -1) {
  throw new Error(`Expected roots column in ${ARTIFACTS.llmRootsLlm}`);
}

function resolveCanonicalRoot(root: string): string {
  return resolvedRootsByRoot.get(root)?.canonicalRoot || root;
}

function tryResolveTikhonovRawRoot(rawRoot: string): string | null {
  const auto = autoResolutionByRoot.get(rawRoot);
  if (!auto) {
    return null;
  }

  if (auto.resolutionKind === 'deterministic') {
    return auto.resolvedCanonicalRoot || resolveCanonicalRoot(auto.resolvedRoot);
  }

  if (auto.resolutionKind === 'needs_root_mapping') {
    const decision = rootMappingDecisions.get(rawRoot);
    if (!decision) {
      return null;
    }
    if (decision.decision === 'lemma_level_conflict') {
      return null;
    }
    return resolveCanonicalRoot(decision.root);
  }

  return null;
}

const finalRootsByNumber = new Map<string, string>();

for (const row of state.dictionaryRows) {
  const kuznetsovaEntries = state.kuznetsovaByLemma.get(row.lemma);
  if (kuznetsovaEntries) {
    const roots = orderedUnique(
      kuznetsovaEntries.map((entry) => resolveCanonicalRoot(entry.root)),
    );
    finalRootsByNumber.set(row.number, roots.join(','));
    continue;
  }

  const homonymRow = completedHomonym.rowsByKey.get(row.number);
  const llmRootsRow = completedLlmRoots.rowsByKey.get(row.number);

  const rawRoots = state.tikhonovByLemma.get(row.lemma) || [];
  const baseRoots: string[] = [];
  const unresolvedRawRoots: string[] = [];

  for (const rawRoot of rawRoots) {
    const resolvedRoot = tryResolveTikhonovRawRoot(rawRoot);
    if (resolvedRoot) {
      baseRoots.push(resolvedRoot);
    } else {
      unresolvedRawRoots.push(rawRoot);
    }
  }

  let finalRoots = orderedUnique(baseRoots);

  if (unresolvedRawRoots.length === 0 && finalRoots.length > 0) {
    finalRootsByNumber.set(row.number, finalRoots.join(','));
    continue;
  }

  if (homonymRow) {
    const roots = orderedUnique(parseRootsList(homonymRow[homonymRootsIndex]).map(resolveCanonicalRoot));
    if (roots.length === 0) {
      throw new Error(`Empty roots in step 05 output for ${row.number} ${row.lemma}`);
    }
    finalRootsByNumber.set(row.number, roots.join(','));
    continue;
  }

  if (llmRootsRow) {
    if (rawRoots.length === 0 || unresolvedRawRoots.length > 0) {
      const roots = orderedUnique(parseRootsList(llmRootsRow[llmRootsIndex]).map(resolveCanonicalRoot));
      if (roots.length === 0) {
        throw new Error(`Empty roots in step 06 output for ${row.number} ${row.lemma}`);
      }
      finalRootsByNumber.set(row.number, roots.join(','));
      continue;
    }
  }

  throw new Error(`Missing final roots for ${row.number} ${row.lemma}`);
}

ensureRootsDir();
writeCsv(
  ARTIFACTS.finalDictionary,
  [...state.dictionaryHeader, 'roots'],
  state.dictionaryRows.map((row) => [...row.columns, finalRootsByNumber.get(row.number) || '']),
);

console.log(
  JSON.stringify(
    {
      output: 'data/roots/dictionary-source-with-roots.csv',
      rows: state.dictionaryRows.length,
    },
    null,
    2,
  ),
);
