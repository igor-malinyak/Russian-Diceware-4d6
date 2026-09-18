import {
  ARTIFACTS,
  ensureRootsDir,
  loadAutoTikhonovResolutionMap,
  loadBaseState,
  loadRootMappingLlmDecisions,
  orderedUnique,
  writeCsv,
} from './lib.ts';

const state = loadBaseState();
const autoResolutionByRoot = loadAutoTikhonovResolutionMap();
const rootMappingDecisions = loadRootMappingLlmDecisions();

const rows: string[][] = [];
for (const row of state.dictionaryRows) {
  if (state.kuznetsovaByLemma.has(row.lemma)) {
    continue;
  }

  const rawRoots = state.tikhonovByLemma.get(row.lemma) || [];
  if (rawRoots.length === 0) {
    continue;
  }

  const deterministicRoots: string[] = [];
  const homonyms: string[] = [];
  let hasUnresolved = false;

  for (const rawRoot of rawRoots) {
    const auto = autoResolutionByRoot.get(rawRoot);
    if (!auto) {
      hasUnresolved = true;
      continue;
    }

    if (auto.resolutionKind === 'homonym') {
      homonyms.push(`${rawRoot} => ${auto.homonymCandidates.join('|')}`);
      continue;
    }

    if (auto.resolutionKind === 'lemma_level_conflict') {
      hasUnresolved = true;
      continue;
    }

    if (auto.resolutionKind === 'deterministic') {
      deterministicRoots.push(auto.resolvedRoot);
      continue;
    }

    const decision = rootMappingDecisions.get(rawRoot);
    if (!decision) {
      hasUnresolved = true;
      continue;
    }
    if (decision.decision === 'lemma_level_conflict') {
      hasUnresolved = true;
      continue;
    }
    deterministicRoots.push(decision.root);
  }

  if (!hasUnresolved && homonyms.length > 0) {
    rows.push([
      row.number,
      row.lemma,
      row.pos,
      rawRoots.join(','),
      orderedUnique(deterministicRoots).join(','),
      homonyms.join('; '),
      '',
    ]);
  }
}

ensureRootsDir();
writeCsv(
  ARTIFACTS.llmTikhonovHomonymOriginal,
  [
    'Number',
    'Lemma',
    'PoS',
    'tikhonov_roots_raw',
    'deterministic_roots',
    'kuznetsova_homonym_candidates',
    'roots',
  ],
  rows,
);

console.log(
  JSON.stringify(
    {
      output: 'data/roots/llm-tikhonov-homonym-disambiguation.original.csv',
      rows: rows.length,
    },
    null,
    2,
  ),
);
