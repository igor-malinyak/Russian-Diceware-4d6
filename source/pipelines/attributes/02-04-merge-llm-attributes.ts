import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  ARTIFACTS,
  readCsvRows,
  writeCsv,
} from './lib.ts';

const chunksDir = path.join(path.dirname(ARTIFACTS.llmAttributesOriginal), 'llm-attributes.chunks');

function getChunkFiles(): string[] {
  return fs.existsSync(chunksDir)
    ? fs.readdirSync(chunksDir)
        .filter((name) => name.endsWith('.llm.csv'))
        .sort((left, right) => left.localeCompare(right, 'en'))
    : [];
}

function collectMergedRows(chunkFiles: string[]): { header: string[]; rows: string[][] } {
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

  return { header: header || [], rows };
}

const chunkFiles = getChunkFiles();
if (chunkFiles.length === 0) {
  throw new Error(`No chunk .llm.csv files found in ${chunksDir}`);
}

const merged = collectMergedRows(chunkFiles);
writeCsv(ARTIFACTS.llmAttributesLlm, merged.header, merged.rows);

console.log(
  JSON.stringify(
    {
      inputDir: 'source/data/attributes/llm-attributes.chunks',
      chunks: chunkFiles.length,
      output: 'source/data/attributes/llm-attributes.llm.csv',
      rows: merged.rows.length,
    },
    null,
    2,
  ),
);
