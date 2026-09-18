import * as fs from 'node:fs';

import { ARTIFACTS, ensureRootsDir, orderedUnique, readCsvRows, writeCsv } from './lib.ts';

function parseRootsList(value: string): string[] {
  return orderedUnique(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function parseIpm(value: string): number {
  const parsed = Number.parseFloat(value.trim());
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

if (!fs.existsSync(ARTIFACTS.finalDictionary)) {
  throw new Error('Missing data/roots/dictionary-source-with-roots.csv. Run step 07 first.');
}

const parsed = readCsvRows(ARTIFACTS.finalDictionary);
const rootsIndex = parsed.header.indexOf('roots');
const ipmIndex = parsed.header.indexOf('IPM');

if (rootsIndex === -1) {
  throw new Error(`Expected roots column in ${ARTIFACTS.finalDictionary}`);
}
if (ipmIndex === -1) {
  throw new Error(`Expected IPM column in ${ARTIFACTS.finalDictionary}`);
}

const ipmByRoot = new Map<string, number>();

for (const row of parsed.rows) {
  const roots = parseRootsList(row[rootsIndex] || '');
  const ipm = parseIpm(row[ipmIndex] || '');

  for (const root of roots) {
    ipmByRoot.set(root, (ipmByRoot.get(root) || 0) + ipm);
  }
}

const rows = [...ipmByRoot.entries()]
  .sort((left, right) => left[0].localeCompare(right[0], 'ru'))
  .map(([root, ipm]) => [root, ipm.toFixed(1)]);

ensureRootsDir();
writeCsv(ARTIFACTS.rootIpm, ['root', 'IPM'], rows);

console.log(
  JSON.stringify(
    {
      output: 'data/roots/root-ipm.csv',
      rows: rows.length,
    },
    null,
    2,
  ),
);
