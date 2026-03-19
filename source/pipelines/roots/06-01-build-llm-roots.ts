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
    rows.push([
      row.number,
      row.lemma,
      row.pos,
      'missing_in_both',
      '',
      '',
      '',
      'No lemma in either Kuznetsova or Tikhonov',
      '',
    ]);
    continue;
  }

  const deterministicRoots: string[] = [];
  const homonymCandidates: string[] = [];
  const unresolvedNotes: string[] = [];
  let hasLemmaLevelConflict = false;

  for (const rawRoot of rawRoots) {
    const auto = autoResolutionByRoot.get(rawRoot);
    if (!auto) {
      unresolvedNotes.push(`No auto resolution row for ${rawRoot}`);
      continue;
    }
    if (auto.resolutionKind === 'homonym') {
      homonymCandidates.push(`${rawRoot} => ${auto.homonymCandidates.join('|')}`);
      continue;
    }
    if (auto.resolutionKind === 'lemma_level_conflict') {
      hasLemmaLevelConflict = true;
      unresolvedNotes.push(auto.note || `Conflicting automatic mapping for ${rawRoot}`);
      continue;
    }
    if (auto.resolutionKind === 'deterministic') {
      deterministicRoots.push(auto.resolvedRoot);
      continue;
    }
    if (auto.resolutionKind === 'needs_root_mapping' && !rootMappingDecisions.has(rawRoot)) {
      unresolvedNotes.push(auto.note || `Missing root-level mapping for ${rawRoot}`);
      continue;
    }

    if (auto.resolutionKind === 'needs_root_mapping') {
      const decision = rootMappingDecisions.get(rawRoot);
      if (decision?.decision === 'lemma_level_conflict') {
        hasLemmaLevelConflict = true;
        unresolvedNotes.push(`Root-level mapping escalated ${rawRoot} to lemma-level conflict`);
      } else if (decision) {
        deterministicRoots.push(decision.root);
      }
    }
  }

  if (homonymCandidates.length > 0 && unresolvedNotes.length === 0) {
    continue;
  }

  if (unresolvedNotes.length > 0) {
    rows.push([
      row.number,
      row.lemma,
      row.pos,
      hasLemmaLevelConflict ? 'lemma_level_conflict' : 'residual_after_root_mapping',
      rawRoots.join(','),
      orderedUnique(deterministicRoots).join(','),
      homonymCandidates.join('; '),
      unresolvedNotes.join('; '),
      '',
    ]);
  }
}

ensureRootsDir();
writeCsv(
  ARTIFACTS.llmRootsOriginal,
  [
    'Number',
    'Lemma',
    'PoS',
    'reason',
    'tikhonov_roots_raw',
    'deterministic_roots',
    'kuznetsova_homonym_candidates',
    'notes',
    'roots',
  ],
  rows,
);

console.log(
  JSON.stringify(
    {
      output: 'source/data/roots/llm-roots.original.csv',
      rows: rows.length,
    },
    null,
    2,
  ),
);
