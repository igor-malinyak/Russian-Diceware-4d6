import * as fs from 'node:fs';
import * as path from 'node:path';

import { ARTIFACTS, readCsvRows, writeCsv } from './lib.ts';

const chunksDir = path.join(
  path.dirname(ARTIFACTS.llmRootsOriginal),
  'llm-roots.chunks',
);

const chunkFiles = fs.existsSync(chunksDir)
  ? fs.readdirSync(chunksDir)
      .filter((name) => name.endsWith('.llm.csv'))
      .sort((left, right) => left.localeCompare(right, 'en'))
  : [];

if (chunkFiles.length === 0) {
  throw new Error(`No chunk .llm.csv files found in ${chunksDir}`);
}

let header: string[] | null = null;
const rows: string[][] = [];

for (const fileName of chunkFiles) {
  const parsed = readCsvRows(path.join(chunksDir, fileName));
  if (!header) {
    header = parsed.header;
  } else if (header.join('\u0000') !== parsed.header.join('\u0000')) {
    throw new Error(`Header mismatch in chunk ${fileName}`);
  }
  rows.push(...parsed.rows);
}

writeCsv(ARTIFACTS.llmRootsLlm, header || [], rows);

console.log(
  JSON.stringify(
    {
      inputDir: 'data/roots/llm-roots.chunks',
      chunks: chunkFiles.length,
      output: 'data/roots/llm-roots.llm.csv',
      rows: rows.length,
    },
    null,
    2,
  ),
);
