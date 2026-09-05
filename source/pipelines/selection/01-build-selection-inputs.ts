import * as fs from 'node:fs';

import {
  ARTIFACTS,
  computeRankingScore,
  ensureSelectionDir,
  formatRankingScore,
  readCsvRows,
  requireColumnIndex,
  writeCsv,
} from './lib.ts';

const RANKING_SCORE_COLUMN = 'ranking_score';
const MANUAL_SELECTION_WIDTH = 5;
const MULTI_ROOT_LEMMAS_LIMIT = 1000;

type RankedRow = {
  columns: string[];
  numberValue: number;
  lemma: string;
  root: string;
  rankingScore: number;
  rankingScoreRaw: string;
};

type RootGroup = {
  root: string;
  rows: RankedRow[];
  maxRankingScore: number;
};

type InputIndexes = {
  number: number;
  lemma: number;
  ipm: number;
  root: number;
  rootIpm: number;
  imageability: number;
  emotionalValence: number;
  isProfane: number;
};

type MultiRootLemma = {
  lemma: string;
  ipm: number;
  ipmRaw: string;
  numberValue: number;
};

function ensureInputArtifactsExist(): void {
  if (!fs.existsSync(ARTIFACTS.dictionaryTopWithAttributes)) {
    throw new Error(
      'Missing source/data/attributes/dictionary-top-with-attributes.csv. Run the attributes pipeline first.',
    );
  }

  if (!fs.existsSync(ARTIFACTS.extraLemmasWithAttributes)) {
    throw new Error(
      'Missing source/data/attributes/extra-lemmas-with-attributes.csv. Run the attributes pipeline first.',
    );
  }

  if (!fs.existsSync(ARTIFACTS.dictionarySourceWithRoots)) {
    throw new Error(
      'Missing source/data/roots/dictionary-source-with-roots.csv. Run the roots pipeline first.',
    );
  }
}

function parseNumber(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (Number.isNaN(parsed)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return parsed;
}

function parseFiniteNumber(
  value: string,
  columnName: string,
  numberValue: string,
  lemma: string,
): number {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${columnName} "${value}" for (${numberValue}, ${lemma})`);
  }

  return parsed;
}

function parseAllowedInteger(
  value: string,
  columnName: string,
  allowedValues: number[],
  numberValue: string,
  lemma: string,
): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!allowedValues.includes(parsed)) {
    throw new Error(
      `Unsupported ${columnName} "${value}" for (${numberValue}, ${lemma}); expected one of ${allowedValues.join(', ')}`,
    );
  }

  return parsed;
}

function countLemmaLength(lemma: string): number {
  return [...lemma.trim()].length;
}

function formatManualSelectionRankingScore(value: number): string {
  return value.toFixed(2);
}

function compareRankedRows(left: RankedRow, right: RankedRow): number {
  if (left.rankingScore !== right.rankingScore) {
    return right.rankingScore - left.rankingScore;
  }

  return left.numberValue - right.numberValue;
}

function compareRootGroups(left: RootGroup, right: RootGroup): number {
  if (left.maxRankingScore !== right.maxRankingScore) {
    return right.maxRankingScore - left.maxRankingScore;
  }

  return left.root.localeCompare(right.root, 'ru');
}

function compareMultiRootLemmas(left: MultiRootLemma, right: MultiRootLemma): number {
  if (left.ipm !== right.ipm) {
    return right.ipm - left.ipm;
  }

  return left.numberValue - right.numberValue;
}

function parseRoots(value: string): string[] {
  return [...new Set(value.split(',').map((root) => root.trim()).filter(Boolean))];
}

function rootBase(root: string): string {
  return root.replace(/-\d+$/u, '');
}

function hasMultipleRootBases(roots: string[]): boolean {
  return new Set(roots.map(rootBase)).size > 1;
}

function loadInputIndexes(header: string[], inputPath: string): InputIndexes {
  return {
    number: requireColumnIndex(header, 'Number', inputPath),
    lemma: requireColumnIndex(header, 'Lemma', inputPath),
    ipm: requireColumnIndex(header, 'IPM', inputPath),
    root: requireColumnIndex(header, 'root', inputPath),
    rootIpm: requireColumnIndex(header, 'root_IPM', inputPath),
    imageability: requireColumnIndex(
      header,
      'imageability',
      inputPath,
    ),
    emotionalValence: requireColumnIndex(
      header,
      'emotional_valence',
      inputPath,
    ),
    isProfane: requireColumnIndex(
      header,
      'is_profane',
      inputPath,
    ),
  };
}

function buildRootGroups(
  inputPath: string,
): { header: string[]; groups: RootGroup[]; inputLemmas: Set<string> } {
  const input = readCsvRows(inputPath);
  const indexes = loadInputIndexes(input.header, inputPath);
  const rowsByRoot = new Map<string, RankedRow[]>();
  const inputLemmas = new Set<string>();

  for (const row of input.rows) {
    const numberValueRaw = row[indexes.number] || '';
    const lemma = row[indexes.lemma] || '';
    const root = row[indexes.root] || '';

    if (!lemma) {
      throw new Error(`Empty Lemma for row ${numberValueRaw || '(missing Number)'}`);
    }
    inputLemmas.add(lemma);
    if (!root) {
      throw new Error(`Empty root for (${numberValueRaw}, ${lemma})`);
    }

    const lemmaIpm = parseFiniteNumber(row[indexes.ipm] || '', 'IPM', numberValueRaw, lemma);
    const rootIpm = parseFiniteNumber(
      row[indexes.rootIpm] || '',
      'root_IPM',
      numberValueRaw,
      lemma,
    );
    const imageability = parseAllowedInteger(
      row[indexes.imageability] || '',
      'imageability',
      [1, 2, 3, 4, 5],
      numberValueRaw,
      lemma,
    );
    const emotionalValence = parseAllowedInteger(
      row[indexes.emotionalValence] || '',
      'emotional_valence',
      [1, 2, 3, 4, 5],
      numberValueRaw,
      lemma,
    );
    const isProfane = parseAllowedInteger(
      row[indexes.isProfane] || '',
      'is_profane',
      [0, 1],
      numberValueRaw,
      lemma,
    );
    const rankingScore = computeRankingScore(
      {
        lemmaIpm,
        rootIpm,
        imageability,
        emotionalValence,
        isProfane,
      },
      countLemmaLength(lemma),
    );

    if (rankingScore === 0) {
      continue;
    }

    const rankedRow: RankedRow = {
      columns: row,
      numberValue: parseNumber(numberValueRaw),
      lemma,
      root,
      rankingScore,
      rankingScoreRaw: formatRankingScore(rankingScore),
    };

    if (!rowsByRoot.has(root)) {
      rowsByRoot.set(root, []);
    }
    rowsByRoot.get(root)?.push(rankedRow);
  }

  const groups = [...rowsByRoot.entries()].map(([root, rows]) => {
    rows.sort(compareRankedRows);
    return {
      root,
      rows,
      maxRankingScore: rows[0].rankingScore,
    };
  });

  groups.sort(compareRootGroups);

  return {
    header: input.header,
    groups,
    inputLemmas,
  };
}

function buildRankedRows(groups: RootGroup[]): string[][] {
  return groups.flatMap((group) =>
    group.rows.map((row) => [...row.columns, row.rankingScoreRaw]),
  );
}

function buildManualSelectionHeader(): string[] {
  const header: string[] = [];

  for (let index = 0; index < MANUAL_SELECTION_WIDTH; index += 1) {
    header.push('S', 'Lemma', 'RS');
  }

  return header;
}

function buildManualSelectionRows(groups: RootGroup[]): string[][] {
  return groups.map((group) => {
    const row: string[] = [];

    for (let index = 0; index < MANUAL_SELECTION_WIDTH; index += 1) {
      const candidate = group.rows[index];
      if (!candidate) {
        row.push('', '', '');
        continue;
      }

      row.push('', candidate.lemma, formatManualSelectionRankingScore(candidate.rankingScore));
    }

    return row;
  });
}

function buildMultiRootLemmaRows(inputLemmas: Set<string>): { rows: string[][]; lemmasSelected: number } {
  const dictionary = readCsvRows(ARTIFACTS.dictionarySourceWithRoots);
  const numberIndex = requireColumnIndex(
    dictionary.header,
    'Number',
    ARTIFACTS.dictionarySourceWithRoots,
  );
  const lemmaIndex = requireColumnIndex(
    dictionary.header,
    'Lemma',
    ARTIFACTS.dictionarySourceWithRoots,
  );
  const ipmIndex = requireColumnIndex(dictionary.header, 'IPM', ARTIFACTS.dictionarySourceWithRoots);
  const rootsIndex = requireColumnIndex(
    dictionary.header,
    'roots',
    ARTIFACTS.dictionarySourceWithRoots,
  );
  const bestByLemma = new Map<string, MultiRootLemma>();

  for (const row of dictionary.rows) {
    const roots = parseRoots(row[rootsIndex] || '');
    if (roots.length < 2 || !hasMultipleRootBases(roots)) {
      continue;
    }

    const lemma = row[lemmaIndex] || '';
    if (!lemma) {
      throw new Error(`Empty Lemma for row ${row[numberIndex] || '(missing Number)'}`);
    }
    if (inputLemmas.has(lemma)) {
      continue;
    }

    const candidate: MultiRootLemma = {
      lemma,
      ipm: parseFiniteNumber(row[ipmIndex] || '', 'IPM', row[numberIndex] || '', lemma),
      ipmRaw: row[ipmIndex] || '',
      numberValue: parseNumber(row[numberIndex] || ''),
    };
    const previous = bestByLemma.get(lemma);
    if (!previous || compareMultiRootLemmas(candidate, previous) < 0) {
      bestByLemma.set(lemma, candidate);
    }
  }

  const lemmas = [...bestByLemma.values()]
    .sort(compareMultiRootLemmas)
    .slice(0, MULTI_ROOT_LEMMAS_LIMIT);
  const rows: string[][] = [];

  for (const candidate of lemmas) {
    rows.push([
      '',
      candidate.lemma,
      candidate.ipmRaw,
      ...Array<string>(MANUAL_SELECTION_WIDTH * 3 - 3).fill(''),
    ]);
  }

  return { rows, lemmasSelected: lemmas.length };
}

ensureInputArtifactsExist();

const dictionaryTop = buildRootGroups(ARTIFACTS.dictionaryTopWithAttributes);
const extraLemmas = buildRootGroups(ARTIFACTS.extraLemmasWithAttributes);
const rankedRows = buildRankedRows(dictionaryTop.groups);
const extraLemmasRankedRows = buildRankedRows(extraLemmas.groups);
const manualSelectionHeader = buildManualSelectionHeader();
const manualSelectionRows = buildManualSelectionRows(dictionaryTop.groups);
const multiRootLemmaRows = buildMultiRootLemmaRows(dictionaryTop.inputLemmas);

ensureSelectionDir();
writeCsv(
  ARTIFACTS.dictionaryTopRanked,
  [...dictionaryTop.header, RANKING_SCORE_COLUMN],
  rankedRows,
);
writeCsv(
  ARTIFACTS.extraLemmasRanked,
  [...extraLemmas.header, RANKING_SCORE_COLUMN],
  extraLemmasRankedRows,
);
writeCsv(ARTIFACTS.manualSelection, manualSelectionHeader, [
  ...manualSelectionRows,
  ...multiRootLemmaRows.rows,
]);

console.log(
  JSON.stringify(
    {
      inputs: [
        'source/data/attributes/dictionary-top-with-attributes.csv',
        'source/data/attributes/extra-lemmas-with-attributes.csv',
      ],
      outputs: [
        'source/data/selection/dictionary-top-ranked.csv',
        'source/data/selection/extra-lemmas-ranked.csv',
        'source/data/selection/manual-selection.csv',
      ],
      rootGroups: dictionaryTop.groups.length,
      rankedRows: rankedRows.length,
      extraLemmaRootGroups: extraLemmas.groups.length,
      extraLemmasRankedRows: extraLemmasRankedRows.length,
      manualSelectionRows: manualSelectionRows.length + multiRootLemmaRows.rows.length,
      multiRootLemmasSelected: multiRootLemmaRows.lemmasSelected,
    },
    null,
    2,
  ),
);
