import {
  ARTIFACTS,
  ensureRootsDir,
  loadBaseState,
  loadAutoTikhonovResolutionMap,
  orderedUnique,
  writeCsv,
} from './lib.ts';

const state = loadBaseState();
const autoResolutionByRoot = loadAutoTikhonovResolutionMap();
const lemmasByTikhonovRoot = new Map<string, Set<string>>();

for (const [lemma, rawRoots] of state.tikhonovByLemma.entries()) {
  for (const rawRoot of rawRoots) {
    if (!lemmasByTikhonovRoot.has(rawRoot)) {
      lemmasByTikhonovRoot.set(rawRoot, new Set<string>());
    }
    lemmasByTikhonovRoot.get(rawRoot)?.add(lemma);
  }
}

const rows = [...autoResolutionByRoot.entries()]
  .filter(([, resolved]) => resolved.resolutionKind === 'needs_root_mapping')
  .sort((left, right) => left[0].localeCompare(right[0], 'ru'))
  .map(([rawRoot]) => {
    const lemmas = orderedUnique(
      [...(lemmasByTikhonovRoot.get(rawRoot) || new Set<string>())]
        .sort((left, right) => {
          const ipmDelta = (state.lemmaToMaxIpm.get(right) || 0) - (state.lemmaToMaxIpm.get(left) || 0);
          return ipmDelta !== 0 ? ipmDelta : left.localeCompare(right, 'ru');
        }),
    );

    return [
      rawRoot,
      lemmas.join('; '),
      '',
      '',
    ];
  });

ensureRootsDir();
writeCsv(
  ARTIFACTS.llmTikhonovRootMappingOriginal,
  ['tikhonov_root', 'lemmas', 'decision', 'root'],
  rows,
);

console.log(
  JSON.stringify(
    {
      output: 'data/roots/llm-tikhonov-root-mapping.original.csv',
      rows: rows.length,
    },
    null,
    2,
  ),
);
