import * as fs from 'node:fs';
import * as path from 'node:path';

import { ARTIFACTS, ensureRootsDir, readCsvRows, writeCsv } from './lib.ts';

const CHUNK_SIZE = 500;
const chunksDir = path.join(
  path.dirname(ARTIFACTS.llmRootsOriginal),
  'llm-roots.chunks',
);

ensureRootsDir();
fs.mkdirSync(chunksDir, { recursive: true });

const parsed = readCsvRows(ARTIFACTS.llmRootsOriginal);
const chunkCount = Math.ceil(parsed.rows.length / CHUNK_SIZE);

for (let index = 0; index < chunkCount; index += 1) {
  const start = index * CHUNK_SIZE;
  const end = start + CHUNK_SIZE;
  const chunkRows = parsed.rows.slice(start, end);
  const chunkId = String(index + 1).padStart(3, '0');
  const originalPath = path.join(chunksDir, `llm-roots.chunk-${chunkId}.original.csv`);
  const llmPath = path.join(chunksDir, `llm-roots.chunk-${chunkId}.llm.csv`);

  writeCsv(originalPath, parsed.header, chunkRows);
  if (!fs.existsSync(llmPath)) {
    writeCsv(llmPath, parsed.header, chunkRows);
    continue;
  }

  const existingLlm = readCsvRows(llmPath);
  const expectedKeys = chunkRows.map((row) => row[0]);
  const actualKeys = existingLlm.rows.map((row) => row[0]);
  if (
    existingLlm.header.join('\u0000') !== parsed.header.join('\u0000')
    || actualKeys.length !== expectedKeys.length
    || actualKeys.some((value, keyIndex) => value !== expectedKeys[keyIndex])
  ) {
    throw new Error(
      `Stale chunk file ${path.basename(llmPath)} does not match the current original schema. Remove or regenerate chunk .llm.csv files before continuing.`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      input: 'source/data/roots/llm-roots.original.csv',
      chunkSize: CHUNK_SIZE,
      chunkCount,
      outputDir: 'source/data/roots/llm-roots.chunks',
    },
    null,
    2,
  ),
);
