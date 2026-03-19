import * as fs from 'node:fs';

import {
  ARTIFACTS,
  ATTRIBUTE_COLUMNS,
  ensureAttributesDir,
  readCsvRows,
  requireColumnIndex,
  writeCsv,
} from './lib.ts';

function ensureInputArtifactExists(): void {
  if (!fs.existsSync(ARTIFACTS.dictionaryTop)) {
    throw new Error('Missing source/data/attributes/dictionary-top.csv. Run step 01 first.');
  }
}

function buildOutputRows(): string[][] {
  const parsed = readCsvRows(ARTIFACTS.dictionaryTop);
  const numberIndex = requireColumnIndex(parsed.header, 'Number', ARTIFACTS.dictionaryTop);
  const lemmaIndex = requireColumnIndex(parsed.header, 'Lemma', ARTIFACTS.dictionaryTop);

  return parsed.rows.map((row) => [
    row[numberIndex] || '',
    row[lemmaIndex] || '',
    '',
    '',
    '',
  ]);
}

ensureInputArtifactExists();

const outputRows = buildOutputRows();

ensureAttributesDir();
writeCsv(
  ARTIFACTS.llmAttributesOriginal,
  ['Number', 'Lemma', ...ATTRIBUTE_COLUMNS],
  outputRows,
);

console.log(
  JSON.stringify(
    {
      input: 'source/data/attributes/dictionary-top.csv',
      output: 'source/data/attributes/llm-attributes.original.csv',
      rows: outputRows.length,
    },
    null,
    2,
  ),
);
