import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACTS,
  ensureRootsDir,
  loadBaseState,
  orderedUnique,
  rootBase,
  writeCsv,
} from './lib.ts';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../..');
const ROOT_GROUPS_PATH = path.join(PROJECT_ROOT, 'data', 'roots', 'root_groups_fixed.txt');

const SUPERSCRIPT_TO_SUFFIX: Record<string, string> = {
  '\u00b9': '-1',
  '\u00b2': '-2',
  '\u00b3': '-3',
  '\u2074': '-4',
  '\u2075': '-5',
  '\u2076': '-6',
};

function normalizeRoot(root: string): string {
  let result = root.trim();
  for (const [source, target] of Object.entries(SUPERSCRIPT_TO_SUFFIX)) {
    result = result.split(source).join(target);
  }
  return result;
}

function rootVariantNumber(root: string): string {
  const match = root.match(/-(\d+)$/u);
  return match ? match[1] : '';
}

function buildCanonicalRootByRoot(roots: string[]): Map<string, string> {
  const lines = fs
    .readFileSync(ROOT_GROUPS_PATH, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  const families: string[][] = [];
  const explicitMap = new Map<string, string>();

  for (const line of lines) {
    if (line.includes('→')) {
      const [sourceRaw, targetRaw] = line.split('→').map((part) => normalizeRoot(part));
      if (sourceRaw && targetRaw) {
        explicitMap.set(sourceRaw, targetRaw);
      }
      continue;
    }
    families.push(line.split('/').map(normalizeRoot).filter(Boolean));
  }

  const follow = (root: string): string => {
    let current = root;
    const seen = new Set<string>();
    while (explicitMap.has(current)) {
      if (seen.has(current)) {
        throw new Error(`Cycle in root_groups_fixed.txt for ${root}`);
      }
      seen.add(current);
      current = explicitMap.get(current) || current;
    }
    return current;
  };

  const canonicalByRoot = new Map<string, string>();
  for (const family of families) {
    const resolvedMembers = orderedUnique(family.map((member) => follow(member)));
    const canonical = resolvedMembers.length === 1 ? resolvedMembers[0] : follow(family[0]);
    for (const member of family) {
      canonicalByRoot.set(member, canonical);
    }
  }

  for (const [source, target] of explicitMap.entries()) {
    canonicalByRoot.set(source, follow(source));
    if (!canonicalByRoot.has(target)) {
      canonicalByRoot.set(target, follow(target));
    }
  }

  for (const root of roots) {
    if (!canonicalByRoot.has(root)) {
      canonicalByRoot.set(root, follow(root));
    }
  }

  return canonicalByRoot;
}

const state = loadBaseState();
const entriesByRoot = new Map<
  string,
  Array<{ lemma: string; lemmaWithNote: string }>
>();
const familyCollector = new Map<string, Set<string>>();

for (const entry of state.kuznetsovaEntries) {
  if (!entriesByRoot.has(entry.root)) {
    entriesByRoot.set(entry.root, []);
  }
  entriesByRoot.get(entry.root)?.push({
    lemma: entry.lemma,
    lemmaWithNote: entry.lemmaWithNote,
  });

  const base = rootBase(entry.root);
  if (!familyCollector.has(base)) {
    familyCollector.set(base, new Set<string>());
  }
  familyCollector.get(base)?.add(entry.root);
}

const roots = [...entriesByRoot.keys()].sort((left, right) => left.localeCompare(right, 'ru'));
const canonicalByRoot = buildCanonicalRootByRoot(roots);

const rows: string[][] = roots.map((root) => {
  const examples = orderedUnique(
    [...(entriesByRoot.get(root) || [])]
      .sort((left, right) => {
        const ipmDelta =
          (state.lemmaToMaxIpm.get(right.lemma) || 0) - (state.lemmaToMaxIpm.get(left.lemma) || 0);
        return ipmDelta !== 0
          ? ipmDelta
          : left.lemmaWithNote.localeCompare(right.lemmaWithNote, 'ru');
      })
      .map((entry) => entry.lemmaWithNote),
  ).slice(0, 10);

  return [
    root,
    rootBase(root),
    canonicalByRoot.get(root) || root,
    (familyCollector.get(rootBase(root)) || new Set<string>()).size > 1 ? '1' : '0',
    rootVariantNumber(root),
    examples.join('; '),
  ];
});

ensureRootsDir();
writeCsv(
  ARTIFACTS.kuznetsovaRoots,
  ['root', 'root_base', 'canonical_root', 'is_homonym', 'variant_no', 'examples'],
  rows,
);

console.log(
  JSON.stringify(
    {
      output: 'data/roots/kuznetsova-roots.csv',
      rows: rows.length,
    },
    null,
    2,
  ),
);
