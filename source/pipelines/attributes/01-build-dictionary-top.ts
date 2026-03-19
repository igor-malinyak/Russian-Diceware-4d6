import * as fs from 'node:fs';

import {
  ARTIFACTS,
  ensureAttributesDir,
  orderedUnique,
  readCsvRows,
  rootBase,
  writeCsv,
} from './lib.ts';

const TOP_ROOTS_LIMIT = 5000;
const TOP_LEMMAS_PER_ROOT = 10;
const TOP_GLOBAL_LEMMAS_LIMIT = 5000;

type RootRank = {
  root: string;
  ipm: number;
  ipmRaw: string;
};

type DictionaryData = {
  header: string[];
  rows: string[][];
  rootsIndex: number;
  numberIndex: number;
  lemmaIndex: number;
  ipmIndex: number;
};

type CandidateRow = {
  columns: string[];
  numberValue: number;
  lemma: string;
  lemmaIpm: number;
  root: string;
};

type CandidateCollection = {
  bestCandidateByLemmaRoot: Map<string, CandidateRow>;
  homonymSplitRows: number;
  skippedComplexMultiRootRows: number;
  collapsedLemmaRootDuplicates: number;
};

type LemmaRank = {
  lemma: string;
  ipm: number;
  numberValue: number;
};

type OutputBuildResult = {
  rows: string[][];
  overflowTopLemmaRows: number;
};

function parseIpm(value: string): number {
  const parsed = Number.parseFloat(value.trim());
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return parsed;
}

function parseNumber(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (Number.isNaN(parsed)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return parsed;
}

function parseRootsList(value: string): string[] {
  return orderedUnique(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function getEligibleRoots(roots: string[]): string[] {
  if (roots.length <= 1) {
    return roots;
  }

  const bases = orderedUnique(roots.map((root) => rootBase(root)));
  if (bases.length === 1) {
    return roots;
  }

  return [];
}

function compareRoots(left: RootRank, right: RootRank): number {
  if (left.ipm !== right.ipm) {
    return right.ipm - left.ipm;
  }

  return left.root.localeCompare(right.root, 'ru');
}

function compareCandidates(left: CandidateRow, right: CandidateRow): number {
  if (left.lemmaIpm !== right.lemmaIpm) {
    return right.lemmaIpm - left.lemmaIpm;
  }

  return left.numberValue - right.numberValue;
}

function compareLemmaRanks(left: LemmaRank, right: LemmaRank): number {
  if (left.ipm !== right.ipm) {
    return right.ipm - left.ipm;
  }

  return left.numberValue - right.numberValue;
}

function isBetterCandidate(left: CandidateRow, right: CandidateRow): boolean {
  return compareCandidates(left, right) < 0;
}

function ensureInputArtifactsExist(): void {
  if (!fs.existsSync(ARTIFACTS.dictionarySourceWithRoots)) {
    throw new Error(
      'Missing source/data/roots/dictionary-source-with-roots.csv. Run the roots pipeline first.',
    );
  }

  if (!fs.existsSync(ARTIFACTS.rootIpm)) {
    throw new Error('Missing source/data/roots/root-ipm.csv. Run the roots pipeline first.');
  }
}

function requireColumnIndex(header: string[], columnName: string, filePath: string): number {
  const index = header.indexOf(columnName);
  if (index === -1) {
    throw new Error(`Expected ${columnName} column in ${filePath}`);
  }

  return index;
}

function loadDictionaryData(): DictionaryData {
  const dictionary = readCsvRows(ARTIFACTS.dictionarySourceWithRoots);

  return {
    ...dictionary,
    rootsIndex: requireColumnIndex(dictionary.header, 'roots', ARTIFACTS.dictionarySourceWithRoots),
    numberIndex: requireColumnIndex(
      dictionary.header,
      'Number',
      ARTIFACTS.dictionarySourceWithRoots,
    ),
    lemmaIndex: requireColumnIndex(dictionary.header, 'Lemma', ARTIFACTS.dictionarySourceWithRoots),
    ipmIndex: requireColumnIndex(dictionary.header, 'IPM', ARTIFACTS.dictionarySourceWithRoots),
  };
}

function loadRootRanksByName(): Map<string, RootRank> {
  const rootIpm = readCsvRows(ARTIFACTS.rootIpm);
  const rootIndex = requireColumnIndex(rootIpm.header, 'root', ARTIFACTS.rootIpm);
  const rootIpmIndex = requireColumnIndex(rootIpm.header, 'IPM', ARTIFACTS.rootIpm);

  const rootRanksByName = new Map<string, RootRank>();

  for (const row of rootIpm.rows) {
    const root = row[rootIndex] || '';
    if (!root) {
      continue;
    }

    if (rootRanksByName.has(root)) {
      throw new Error(`Duplicate root ${root} in ${ARTIFACTS.rootIpm}`);
    }

    rootRanksByName.set(root, {
      root,
      ipmRaw: row[rootIpmIndex] || '',
      ipm: parseIpm(row[rootIpmIndex] || ''),
    });
  }

  return rootRanksByName;
}

function buildCandidateRow(row: string[], dictionary: DictionaryData, root: string): CandidateRow {
  return {
    columns: row,
    numberValue: parseNumber(row[dictionary.numberIndex] || ''),
    lemma: row[dictionary.lemmaIndex] || '',
    lemmaIpm: parseIpm(row[dictionary.ipmIndex] || ''),
    root,
  };
}

function addCandidate(
  bestCandidateByLemmaRoot: Map<string, CandidateRow>,
  candidate: CandidateRow,
): boolean {
  const key = `${candidate.lemma}\u0000${candidate.root}`;
  const previous = bestCandidateByLemmaRoot.get(key);

  if (!previous) {
    bestCandidateByLemmaRoot.set(key, candidate);
    return false;
  }

  if (isBetterCandidate(candidate, previous)) {
    bestCandidateByLemmaRoot.set(key, candidate);
  }

  return true;
}

function collectCandidates(dictionary: DictionaryData): CandidateCollection {
  let homonymSplitRows = 0;
  let skippedComplexMultiRootRows = 0;
  let collapsedLemmaRootDuplicates = 0;
  const bestCandidateByLemmaRoot = new Map<string, CandidateRow>();

  for (const row of dictionary.rows) {
    const roots = parseRootsList(row[dictionary.rootsIndex] || '');
    const eligibleRoots = getEligibleRoots(roots);

    if (roots.length > 1 && eligibleRoots.length === roots.length) {
      homonymSplitRows += 1;
    }
    if (roots.length > 1 && eligibleRoots.length === 0) {
      skippedComplexMultiRootRows += 1;
      continue;
    }

    for (const root of eligibleRoots) {
      const candidate = buildCandidateRow(row, dictionary, root);
      if (addCandidate(bestCandidateByLemmaRoot, candidate)) {
        collapsedLemmaRootDuplicates += 1;
      }
    }
  }

  return {
    bestCandidateByLemmaRoot,
    homonymSplitRows,
    skippedComplexMultiRootRows,
    collapsedLemmaRootDuplicates,
  };
}

function selectGlobalTopLemmas(dictionary: DictionaryData): Set<string> {
  const bestLemmaRankByLemma = new Map<string, LemmaRank>();

  for (const row of dictionary.rows) {
    const lemma = row[dictionary.lemmaIndex] || '';
    const rank: LemmaRank = {
      lemma,
      ipm: parseIpm(row[dictionary.ipmIndex] || ''),
      numberValue: parseNumber(row[dictionary.numberIndex] || ''),
    };

    const previous = bestLemmaRankByLemma.get(lemma);
    if (!previous || compareLemmaRanks(rank, previous) < 0) {
      bestLemmaRankByLemma.set(lemma, rank);
    }
  }

  return new Set(
    [...bestLemmaRankByLemma.values()]
      .sort(compareLemmaRanks)
      .slice(0, TOP_GLOBAL_LEMMAS_LIMIT)
      .map((rank) => rank.lemma),
  );
}

function groupCandidatesByRoot(
  bestCandidateByLemmaRoot: Map<string, CandidateRow>,
): Map<string, CandidateRow[]> {
  const candidatesByRoot = new Map<string, CandidateRow[]>();

  for (const candidate of bestCandidateByLemmaRoot.values()) {
    const existing = candidatesByRoot.get(candidate.root);
    if (existing) {
      existing.push(candidate);
      continue;
    }

    candidatesByRoot.set(candidate.root, [candidate]);
  }

  return candidatesByRoot;
}

function selectRankedRoots(
  rootRanksByName: Map<string, RootRank>,
  candidatesByRoot: Map<string, CandidateRow[]>,
): RootRank[] {
  for (const root of candidatesByRoot.keys()) {
    if (!rootRanksByName.has(root)) {
      throw new Error(`Missing root IPM for ${root}`);
    }
  }

  return [...rootRanksByName.values()]
    .filter((row) => candidatesByRoot.has(row.root))
    .sort(compareRoots)
    .slice(0, TOP_ROOTS_LIMIT);
}

function buildOutputHeader(dictionary: DictionaryData): string[] {
  return [
    ...dictionary.header.filter((_, index) => index !== dictionary.rootsIndex),
    'root',
    'root_IPM',
  ];
}

function buildOutputRow(candidate: CandidateRow, rootsIndex: number, rootIpmRaw: string): string[] {
  const rowWithoutRoots = candidate.columns.filter((_, index) => index !== rootsIndex);
  return [...rowWithoutRoots, candidate.root, rootIpmRaw];
}

function buildOutputRows(
  rankedRoots: RootRank[],
  candidatesByRoot: Map<string, CandidateRow[]>,
  rootsIndex: number,
  globalTopLemmas: Set<string>,
): OutputBuildResult {
  const outputRows: string[][] = [];
  let overflowTopLemmaRows = 0;

  for (const rankedRoot of rankedRoots) {
    const candidates = candidatesByRoot.get(rankedRoot.root) || [];
    candidates.sort(compareCandidates);

    const baseCandidates = candidates.slice(0, TOP_LEMMAS_PER_ROOT);
    const overflowCandidates = candidates
      .slice(TOP_LEMMAS_PER_ROOT)
      .filter((candidate) => globalTopLemmas.has(candidate.lemma));

    overflowTopLemmaRows += overflowCandidates.length;

    for (const candidate of [...baseCandidates, ...overflowCandidates]) {
      outputRows.push(buildOutputRow(candidate, rootsIndex, rankedRoot.ipmRaw));
    }
  }

  return {
    rows: outputRows,
    overflowTopLemmaRows,
  };
}

ensureInputArtifactsExist();

const dictionary = loadDictionaryData();
const rootRanksByName = loadRootRanksByName();
const candidateCollection = collectCandidates(dictionary);
const globalTopLemmas = selectGlobalTopLemmas(dictionary);
const candidatesByRoot = groupCandidatesByRoot(candidateCollection.bestCandidateByLemmaRoot);
const rankedRoots = selectRankedRoots(rootRanksByName, candidatesByRoot);
const outputHeader = buildOutputHeader(dictionary);
const outputBuildResult = buildOutputRows(
  rankedRoots,
  candidatesByRoot,
  dictionary.rootsIndex,
  globalTopLemmas,
);
const outputRows = outputBuildResult.rows;

ensureAttributesDir();
writeCsv(ARTIFACTS.dictionaryTop, outputHeader, outputRows);

console.log(
  JSON.stringify(
    {
      output: 'source/data/attributes/dictionary-top.csv',
      rows: outputRows.length,
      rootsSelected: rankedRoots.length,
      rootsWithEligibleLemmas: candidatesByRoot.size,
      homonymSplitRows: candidateCollection.homonymSplitRows,
      skippedComplexMultiRootRows: candidateCollection.skippedComplexMultiRootRows,
      collapsedLemmaRootDuplicates: candidateCollection.collapsedLemmaRootDuplicates,
      globalTopLemmasSelected: globalTopLemmas.size,
      overflowTopLemmaRows: outputBuildResult.overflowTopLemmaRows,
      topLemmasPerRoot: TOP_LEMMAS_PER_ROOT,
    },
    null,
    2,
  ),
);
