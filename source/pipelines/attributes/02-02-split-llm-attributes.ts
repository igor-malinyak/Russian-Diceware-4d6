import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  ARTIFACTS,
  ensureAttributesDir,
  readCsvRows,
  writeCsv,
} from './lib.ts';

const CHUNK_SIZE = 1000;
const chunksDir = path.join(path.dirname(ARTIFACTS.llmAttributesOriginal), 'llm-attributes.chunks');

function writeChunkFiles(header: string[], rows: string[][]): number {
  const chunkCount = Math.ceil(rows.length / CHUNK_SIZE);

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * CHUNK_SIZE;
    const end = start + CHUNK_SIZE;
    const chunkRows = rows.slice(start, end);
    const chunkId = String(index + 1).padStart(3, '0');
    const originalPath = path.join(chunksDir, `llm-attributes.chunk-${chunkId}.original.csv`);

    writeCsv(originalPath, header, chunkRows);
  }

  return chunkCount;
}

ensureAttributesDir();
fs.mkdirSync(chunksDir, { recursive: true });

const parsed = readCsvRows(ARTIFACTS.llmAttributesOriginal);
const chunkCount = writeChunkFiles(parsed.header, parsed.rows);

console.log(
  JSON.stringify(
    {
      input: 'source/data/attributes/llm-attributes.original.csv',
      chunkSize: CHUNK_SIZE,
      chunkCount,
      outputDir: 'source/data/attributes/llm-attributes.chunks',
    },
    null,
    2,
  ),
);
