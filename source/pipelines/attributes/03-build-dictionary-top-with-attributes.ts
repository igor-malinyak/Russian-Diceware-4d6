import * as fs from 'node:fs';

import {
  ARTIFACTS,
  ATTRIBUTE_COLUMNS,
  ensureAttributesDir,
  readCsvRows,
  requireColumnIndex,
  writeCsv,
} from './lib.ts';

const ALLOWED_IMAGEABILITY = new Set(['1', '2', '3', '4', '5']);
const ALLOWED_EMOTIONAL_VALENCE = new Set(['1', '2', '3', '4', '5']);
const ALLOWED_IS_PROFANE = new Set(['0', '1']);

function ensureInputArtifactsExist(): void {
  if (!fs.existsSync(ARTIFACTS.dictionaryTop)) {
    throw new Error('Missing source/data/attributes/dictionary-top.csv. Run step 01 first.');
  }
  if (!fs.existsSync(ARTIFACTS.llmAttributesLlm)) {
    throw new Error('Missing source/data/attributes/llm-attributes.llm.csv. Run step 02 first.');
  }
}

function buildOutputRows(): { header: string[]; rows: string[][] } {
  const dictionaryTop = readCsvRows(ARTIFACTS.dictionaryTop);
  const llmAttributes = readCsvRows(ARTIFACTS.llmAttributesLlm);
  const numberIndex = requireColumnIndex(dictionaryTop.header, 'Number', ARTIFACTS.dictionaryTop);
  const lemmaIndex = requireColumnIndex(dictionaryTop.header, 'Lemma', ARTIFACTS.dictionaryTop);
  const llmNumberIndex = requireColumnIndex(llmAttributes.header, 'Number', ARTIFACTS.llmAttributesLlm);
  const llmLemmaIndex = requireColumnIndex(llmAttributes.header, 'Lemma', ARTIFACTS.llmAttributesLlm);
  const attributeIndexes = ATTRIBUTE_COLUMNS.map((columnName) =>
    requireColumnIndex(llmAttributes.header, columnName, ARTIFACTS.llmAttributesLlm),
  );

  for (const columnName of ATTRIBUTE_COLUMNS) {
    if (dictionaryTop.header.includes(columnName)) {
      throw new Error(`Column ${columnName} already exists in source/data/attributes/dictionary-top.csv`);
    }
  }
  if (dictionaryTop.rows.length !== llmAttributes.rows.length) {
    throw new Error(
      `Row count mismatch: ${dictionaryTop.rows.length} in dictionary-top.csv vs ${llmAttributes.rows.length} in llm-attributes.llm.csv`,
    );
  }

  const rows = dictionaryTop.rows.map((row, rowIndex) => {
    const llmRow = llmAttributes.rows[rowIndex];
    const number = row[numberIndex] || '';
    const lemma = row[lemmaIndex] || '';
    const llmNumber = llmRow?.[llmNumberIndex] || '';
    const llmLemma = llmRow?.[llmLemmaIndex] || '';

    if (number !== llmNumber || lemma !== llmLemma) {
      throw new Error(
        `Row mismatch at row ${rowIndex + 2}: expected (${number}, ${lemma}), got (${llmNumber}, ${llmLemma})`,
      );
    }

    const attributeValues = attributeIndexes.map((index) => llmRow?.[index] || '');

    if (!ALLOWED_IMAGEABILITY.has(attributeValues[0] || '')) {
      throw new Error(`Unsupported imageability "${attributeValues[0] || ''}" for (${number}, ${lemma})`);
    }
    if (!ALLOWED_EMOTIONAL_VALENCE.has(attributeValues[1] || '')) {
      throw new Error(
        `Unsupported emotional_valence "${attributeValues[1] || ''}" for (${number}, ${lemma})`,
      );
    }
    if (!ALLOWED_IS_PROFANE.has(attributeValues[2] || '')) {
      throw new Error(`Unsupported is_profane "${attributeValues[2] || ''}" for (${number}, ${lemma})`);
    }

    return [...row, ...attributeValues];
  });

  return {
    header: [...dictionaryTop.header, ...ATTRIBUTE_COLUMNS],
    rows,
  };
}

ensureInputArtifactsExist();

const output = buildOutputRows();
ensureAttributesDir();
writeCsv(ARTIFACTS.dictionaryTopWithAttributes, output.header, output.rows);

console.log(
  JSON.stringify(
    {
      inputDictionary: 'source/data/attributes/dictionary-top.csv',
      inputAttributes: 'source/data/attributes/llm-attributes.llm.csv',
      output: 'source/data/attributes/dictionary-top-with-attributes.csv',
      rows: output.rows.length,
    },
    null,
    2,
  ),
);
