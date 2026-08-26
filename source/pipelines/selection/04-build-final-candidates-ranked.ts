import * as fs from 'node:fs';

import {
  ARTIFACTS,
  ensureSelectionDir,
  readCsvRows,
  readManualSelection,
  requireColumnIndex,
  writeCsv,
} from './lib.ts';

type RankedCandidate = {
  columns: string[];
  lemma: string;
  numberValue: number;
  rankingScore: number;
};

function ensureInputArtifactsExist(): void {
  const requiredArtifacts = [
    ARTIFACTS.manualSelectionCompleted,
    ARTIFACTS.dictionaryTopRanked,
    ARTIFACTS.extraLemmasRanked,
  ];

  for (const artifact of requiredArtifacts) {
    if (!fs.existsSync(artifact)) {
      throw new Error(`Missing input artifact: ${artifact}`);
    }
  }
}

function parseFiniteNumber(value: string, columnName: string, lemma: string): number {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${columnName} "${value}" for lemma "${lemma}"`);
  }

  return parsed;
}

function parseNumber(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  if (left.rankingScore !== right.rankingScore) {
    return right.rankingScore - left.rankingScore;
  }

  if (left.numberValue !== right.numberValue) {
    return left.numberValue - right.numberValue;
  }

  return left.lemma.localeCompare(right.lemma, 'ru');
}

function assertMatchingHeaders(reference: string[], candidate: string[], inputPath: string): void {
  if (
    reference.length !== candidate.length ||
    reference.some((column, index) => column !== candidate[index])
  ) {
    throw new Error(`CSV header does not match the other ranked input: ${inputPath}`);
  }
}

function loadRankedCandidates(
  inputPath: string,
  expectedHeader?: string[],
): { header: string[]; candidates: RankedCandidate[] } {
  const { header, rows } = readCsvRows(inputPath);
  if (expectedHeader) {
    assertMatchingHeaders(expectedHeader, header, inputPath);
  }

  const lemmaIndex = requireColumnIndex(header, 'Lemma', inputPath);
  const numberIndex = requireColumnIndex(header, 'Number', inputPath);
  const rankingScoreIndex = requireColumnIndex(header, 'ranking_score', inputPath);
  const candidates = rows.map((columns) => {
    const lemma = (columns[lemmaIndex] || '').trim();
    if (!lemma) {
      throw new Error(`Empty Lemma in ${inputPath}`);
    }

    return {
      columns,
      lemma,
      numberValue: parseNumber(columns[numberIndex] || ''),
      rankingScore: parseFiniteNumber(
        columns[rankingScoreIndex] || '',
        'ranking_score',
        lemma,
      ),
    };
  });

  return { header, candidates };
}

function indexBestCandidateByLemma(
  candidates: RankedCandidate[],
): Map<string, RankedCandidate> {
  const bestByLemma = new Map<string, RankedCandidate>();

  for (const candidate of candidates) {
    const previous = bestByLemma.get(candidate.lemma);
    if (!previous || compareCandidates(candidate, previous) < 0) {
      bestByLemma.set(candidate.lemma, candidate);
    }
  }

  return bestByLemma;
}

function selectFinalCandidates(
  selectedLemmas: string[],
  rankedCandidates: RankedCandidate[],
): RankedCandidate[] {
  const bestByLemma = indexBestCandidateByLemma(rankedCandidates);
  const missingLemmas = selectedLemmas.filter((lemma) => !bestByLemma.has(lemma));

  if (missingLemmas.length > 0) {
    throw new Error(
      `Selected lemmas are missing from the ranked inputs: ${missingLemmas.join(', ')}`,
    );
  }

  return selectedLemmas
    .map((lemma) => bestByLemma.get(lemma))
    .filter((candidate): candidate is RankedCandidate => candidate !== undefined)
    .sort(compareCandidates);
}

ensureInputArtifactsExist();

const selection = readManualSelection(ARTIFACTS.manualSelectionCompleted);
const dictionaryTop = loadRankedCandidates(ARTIFACTS.dictionaryTopRanked);
const extraLemmas = loadRankedCandidates(
  ARTIFACTS.extraLemmasRanked,
  dictionaryTop.header,
);
const finalCandidates = selectFinalCandidates(selection.uniqueSelected, [
  ...dictionaryTop.candidates,
  ...extraLemmas.candidates,
]);

ensureSelectionDir();
writeCsv(
  ARTIFACTS.finalCandidatesRanked,
  dictionaryTop.header,
  finalCandidates.map((candidate) => candidate.columns),
);

console.log(
  JSON.stringify(
    {
      inputs: [
        'source/data/selection/manual-selection-completed.csv',
        'source/data/selection/dictionary-top-ranked.csv',
        'source/data/selection/extra-lemmas-ranked.csv',
      ],
      output: 'source/data/selection/final-candidates-ranked.csv',
      selectedLemmas: selection.uniqueSelected.length,
      finalCandidates: finalCandidates.length,
    },
    null,
    2,
  ),
);
