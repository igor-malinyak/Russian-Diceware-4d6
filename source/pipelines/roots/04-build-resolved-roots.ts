import {
  ARTIFACTS,
  ensureRootsDir,
  loadAutoTikhonovResolutionMap,
  loadBaseState,
  loadKuznetsovaRootsByRoot,
  loadRootMappingLlmDecisions,
  orderedUnique,
  rootBase,
  writeCsv,
} from './lib.ts';

const state = loadBaseState();
const kuznetsovaRootsByRoot = loadKuznetsovaRootsByRoot();
const autoResolutionByRoot = loadAutoTikhonovResolutionMap();
const rootMappingDecisions = loadRootMappingLlmDecisions();

const sourceByRoot = new Map<string, string>();
const examplesByRoot = new Map<string, Map<string, number>>();
const lemmasByRawRoot = new Map<string, Set<string>>();

for (const info of kuznetsovaRootsByRoot.values()) {
  sourceByRoot.set(info.root, 'kuznetsova');
  examplesByRoot.set(info.root, new Map<string, number>());
}

for (const [lemma, rawRoots] of state.tikhonovByLemma.entries()) {
  for (const rawRoot of rawRoots) {
    if (!lemmasByRawRoot.has(rawRoot)) {
      lemmasByRawRoot.set(rawRoot, new Set<string>());
    }
    lemmasByRawRoot.get(rawRoot)?.add(lemma);
  }
}

for (const entry of state.kuznetsovaEntries) {
  if (!examplesByRoot.has(entry.root)) {
    examplesByRoot.set(entry.root, new Map<string, number>());
  }
  const ipm = state.lemmaToMaxIpm.get(entry.lemma) || 0;
  const examples = examplesByRoot.get(entry.root);
  examples?.set(entry.lemmaWithNote, Math.max(examples.get(entry.lemmaWithNote) || 0, ipm));
}

for (const [rawRoot, auto] of autoResolutionByRoot.entries()) {
  let resolvedRoot = '';

  if (auto.resolutionKind === 'deterministic') {
    resolvedRoot = auto.resolvedRoot;
  } else if (auto.resolutionKind === 'needs_root_mapping') {
    const decision = rootMappingDecisions.get(rawRoot);
    if (decision && decision.decision !== 'lemma_level_conflict') {
      resolvedRoot = decision.root;
    }
  }

  if (!resolvedRoot) {
    continue;
  }

  if (!sourceByRoot.has(resolvedRoot)) {
    sourceByRoot.set(
      resolvedRoot,
      kuznetsovaRootsByRoot.has(resolvedRoot) ? 'kuznetsova' : 'tikhonov_new',
    );
  }
  if (!examplesByRoot.has(resolvedRoot)) {
    examplesByRoot.set(resolvedRoot, new Map<string, number>());
  }

  const examples = examplesByRoot.get(resolvedRoot);
  for (const lemma of lemmasByRawRoot.get(rawRoot) || new Set<string>()) {
    const ipm = state.lemmaToMaxIpm.get(lemma) || 0;
    examples?.set(lemma, Math.max(examples.get(lemma) || 0, ipm));
  }
}

const rows = [...sourceByRoot.keys()]
  .sort((left, right) => left.localeCompare(right, 'ru'))
  .map((root) => {
    const canonicalRoot = kuznetsovaRootsByRoot.get(root)?.canonicalRoot || root;
    const examples = orderedUnique(
      [...(examplesByRoot.get(root)?.entries() || [])]
        .sort((left, right) => {
          const ipmDelta = right[1] - left[1];
          return ipmDelta !== 0 ? ipmDelta : left[0].localeCompare(right[0], 'ru');
        })
        .map(([lemma]) => lemma),
    ).slice(0, 10);

    return [
      root,
      rootBase(root),
      canonicalRoot,
      sourceByRoot.get(root) || 'kuznetsova',
      examples.join('; '),
    ];
  });

ensureRootsDir();
writeCsv(
  ARTIFACTS.resolvedRoots,
  ['root', 'root_base', 'canonical_root', 'source', 'examples'],
  rows,
);

console.log(
  JSON.stringify(
    {
      output: 'source/data/roots/resolved-roots.csv',
      rows: rows.length,
    },
    null,
    2,
  ),
);
