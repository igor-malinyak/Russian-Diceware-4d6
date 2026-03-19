import {
  ARTIFACTS,
  ensureRootsDir,
  loadBaseState,
  loadKuznetsovaRootsByRoot,
  orderedUnique,
  rootBase,
  writeCsv,
} from './lib.ts';

const state = loadBaseState();
const kuznetsovaRootsByRoot = loadKuznetsovaRootsByRoot();

const autoCandidatesByRoot = new Map<string, Set<string>>();
for (const [lemma, entries] of state.kuznetsovaByLemma.entries()) {
  const uniqueRoots = orderedUnique(entries.map((entry) => entry.root));
  if (uniqueRoots.length !== 1) {
    continue;
  }

  const tikhonovRoots = state.tikhonovByLemma.get(lemma) || [];
  if (tikhonovRoots.length !== 1) {
    continue;
  }

  const tikhonovRoot = tikhonovRoots[0];
  if (!autoCandidatesByRoot.has(tikhonovRoot)) {
    autoCandidatesByRoot.set(tikhonovRoot, new Set<string>());
  }
  autoCandidatesByRoot.get(tikhonovRoot)?.add(uniqueRoots[0]);
}

const allHomonymVariantsByBase = new Map<string, string[]>();
for (const info of kuznetsovaRootsByRoot.values()) {
  const base = info.rootBase;
  if (!allHomonymVariantsByBase.has(base)) {
    allHomonymVariantsByBase.set(base, []);
  }
  allHomonymVariantsByBase.get(base)?.push(info.root);
}

const allRawRoots = new Set<string>();
for (const rawRoots of state.tikhonovByLemma.values()) {
  for (const rawRoot of rawRoots) {
    allRawRoots.add(rawRoot);
  }
}

const rows: string[][] = [];
for (const rawRoot of [...allRawRoots].sort((left, right) => left.localeCompare(right, 'ru'))) {
  const autoCandidates = orderedUnique([
    ...(autoCandidatesByRoot.get(rawRoot) || new Set<string>()),
  ]).sort((left, right) => left.localeCompare(right, 'ru'));

  let resolutionKind:
    | 'deterministic'
    | 'homonym'
    | 'needs_root_mapping'
    | 'lemma_level_conflict' = 'needs_root_mapping';
  let resolvedRoot = '';
  let resolvedCanonicalRoot = '';
  let homonymCandidates = '';
  let note = 'No confirmed automatic mapping to a Kuznetsova root';

  if (autoCandidates.length === 1) {
    resolutionKind = 'deterministic';
    resolvedRoot = autoCandidates[0];
    resolvedCanonicalRoot = kuznetsovaRootsByRoot.get(resolvedRoot)?.canonicalRoot || resolvedRoot;
    note = '';
  } else if (autoCandidates.length > 1) {
    const candidateBases = orderedUnique(autoCandidates.map(rootBase));
    if (candidateBases.length === 1) {
      resolutionKind = 'homonym';
      note = '';
      homonymCandidates = orderedUnique(allHomonymVariantsByBase.get(candidateBases[0]) || [])
        .sort((left, right) => left.localeCompare(right, 'ru'))
        .join('|');
    } else {
      resolutionKind = 'lemma_level_conflict';
      note = `Conflicting automatic candidates across lemmas: ${autoCandidates.join('|')}`;
    }
  }

  rows.push([
    rawRoot,
    autoCandidates.join('|'),
    resolutionKind,
    resolvedRoot,
    resolvedCanonicalRoot,
    homonymCandidates,
    note,
  ]);
}

ensureRootsDir();
writeCsv(
  ARTIFACTS.tikhonovAutoRootResolution,
  [
    'tikhonov_root',
    'auto_candidates',
    'resolution_kind',
    'resolved_root',
    'resolved_canonical_root',
    'kuznetsova_homonym_candidates',
    'notes',
  ],
  rows,
);

console.log(
  JSON.stringify(
    {
      output: 'source/data/roots/tikhonov-auto-root-resolution.csv',
      rows: rows.length,
    },
    null,
    2,
  ),
);
