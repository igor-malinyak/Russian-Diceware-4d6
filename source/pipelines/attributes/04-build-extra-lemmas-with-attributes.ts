import * as fs from 'node:fs';

import {
  ARTIFACTS,
  ATTRIBUTE_COLUMNS,
  ensureAttributesDir,
  orderedUnique,
  readCsvRows,
  requireColumnIndex,
  writeCsv,
} from './lib.ts';

const ALLOWED_IMAGEABILITY = new Set(['1', '2', '3', '4', '5']);
const ALLOWED_EMOTIONAL_VALENCE = new Set(['1', '2', '3', '4', '5']);
const ALLOWED_IS_PROFANE = new Set(['0', '1']);

type DictionaryData = {
  header: string[];
  rowsByNumber: Map<string, string[]>;
  numberIndex: number;
  lemmaIndex: number;
  rootsIndex: number;
};

type RootIpm = {
  raw: string;
  value: number;
};

function ensureInputArtifactsExist(): void {
  if (!fs.existsSync(ARTIFACTS.extraLemmasLlmAttributesOriginal)) {
    throw new Error(
      'Missing source/data/attributes/extra-lemmas-llm-attributes.original.csv.',
    );
  }
  if (!fs.existsSync(ARTIFACTS.extraLemmasLlmAttributesLlm)) {
    throw new Error(
      'Missing source/data/attributes/extra-lemmas-llm-attributes.llm.csv. Fill the LLM attributes first.',
    );
  }
  if (!fs.existsSync(ARTIFACTS.dictionarySourceWithRoots)) {
    throw new Error(
      'Missing source/data/roots/dictionary-source-with-roots.csv. Run the roots pipeline first.',
    );
  }
  if (!fs.existsSync(ARTIFACTS.rootIpm)) {
    throw new Error('Missing source/data/roots/root-ipm.csv. Run the roots pipeline first.');
  }
}

function parseFiniteNumber(value: string, description: string): number {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${description} "${value}"`);
  }

  return parsed;
}

function parseRootsList(value: string): string[] {
  return orderedUnique(
    value
      .split(',')
      .map((root) => root.trim())
      .filter(Boolean),
  );
}

function loadDictionaryData(): DictionaryData {
  const dictionary = readCsvRows(ARTIFACTS.dictionarySourceWithRoots);
  const numberIndex = requireColumnIndex(
    dictionary.header,
    'Number',
    ARTIFACTS.dictionarySourceWithRoots,
  );
  const lemmaIndex = requireColumnIndex(
    dictionary.header,
    'Lemma',
    ARTIFACTS.dictionarySourceWithRoots,
  );
  const rootsIndex = requireColumnIndex(
    dictionary.header,
    'roots',
    ARTIFACTS.dictionarySourceWithRoots,
  );
  const rowsByNumber = new Map<string, string[]>();

  for (const row of dictionary.rows) {
    const number = row[numberIndex] || '';
    if (!number) {
      throw new Error('Empty Number in source/data/roots/dictionary-source-with-roots.csv');
    }
    if (rowsByNumber.has(number)) {
      throw new Error(
        `Duplicate Number ${number} in source/data/roots/dictionary-source-with-roots.csv`,
      );
    }

    rowsByNumber.set(number, row);
  }

  return {
    header: dictionary.header,
    rowsByNumber,
    numberIndex,
    lemmaIndex,
    rootsIndex,
  };
}

function loadRootIpmByName(): Map<string, RootIpm> {
  const rootIpm = readCsvRows(ARTIFACTS.rootIpm);
  const rootIndex = requireColumnIndex(rootIpm.header, 'root', ARTIFACTS.rootIpm);
  const ipmIndex = requireColumnIndex(rootIpm.header, 'IPM', ARTIFACTS.rootIpm);
  const rootIpmByName = new Map<string, RootIpm>();

  for (const row of rootIpm.rows) {
    const root = row[rootIndex] || '';
    const raw = row[ipmIndex] || '';

    if (!root) {
      throw new Error('Empty root in source/data/roots/root-ipm.csv');
    }
    if (rootIpmByName.has(root)) {
      throw new Error(`Duplicate root ${root} in source/data/roots/root-ipm.csv`);
    }

    rootIpmByName.set(root, {
      raw,
      value: parseFiniteNumber(raw, `IPM for root ${root}`),
    });
  }

  return rootIpmByName;
}

function calculateRootIpm(rootsRaw: string, rootIpmByName: Map<string, RootIpm>): string {
  const roots = parseRootsList(rootsRaw);
  if (roots.length === 0) {
    throw new Error('Cannot calculate root_IPM for an empty root list');
  }

  const rootValues = roots.map((root) => {
    const rootIpm = rootIpmByName.get(root);
    if (!rootIpm) {
      throw new Error(`Missing root IPM for ${root}`);
    }

    return rootIpm;
  });

  if (rootValues.length === 1) {
    return rootValues[0].raw;
  }

  return rootValues.reduce((sum, rootIpm) => sum + rootIpm.value, 0).toFixed(1);
}

function buildOutputRows(): { header: string[]; rows: string[][] } {
  const original = readCsvRows(ARTIFACTS.extraLemmasLlmAttributesOriginal);
  const llmAttributes = readCsvRows(ARTIFACTS.extraLemmasLlmAttributesLlm);
  const dictionary = loadDictionaryData();
  const rootIpmByName = loadRootIpmByName();
  const originalNumberIndex = requireColumnIndex(
    original.header,
    'Number',
    ARTIFACTS.extraLemmasLlmAttributesOriginal,
  );
  const originalLemmaIndex = requireColumnIndex(
    original.header,
    'Lemma',
    ARTIFACTS.extraLemmasLlmAttributesOriginal,
  );
  const llmNumberIndex = requireColumnIndex(
    llmAttributes.header,
    'Number',
    ARTIFACTS.extraLemmasLlmAttributesLlm,
  );
  const llmLemmaIndex = requireColumnIndex(
    llmAttributes.header,
    'Lemma',
    ARTIFACTS.extraLemmasLlmAttributesLlm,
  );
  const attributeIndexes = ATTRIBUTE_COLUMNS.map((columnName) =>
    requireColumnIndex(
      llmAttributes.header,
      columnName,
      ARTIFACTS.extraLemmasLlmAttributesLlm,
    ),
  );

  if (original.header.join('\u0000') !== llmAttributes.header.join('\u0000')) {
    throw new Error(
      'Header mismatch: source/data/attributes/extra-lemmas-llm-attributes.original.csv vs source/data/attributes/extra-lemmas-llm-attributes.llm.csv',
    );
  }
  if (original.rows.length !== llmAttributes.rows.length) {
    throw new Error(
      `Row count mismatch: ${original.rows.length} in extra-lemmas-llm-attributes.original.csv vs ${llmAttributes.rows.length} in extra-lemmas-llm-attributes.llm.csv`,
    );
  }

  for (const columnName of ATTRIBUTE_COLUMNS) {
    if (dictionary.header.includes(columnName)) {
      throw new Error(
        `Column ${columnName} already exists in source/data/roots/dictionary-source-with-roots.csv`,
      );
    }
  }

  const rows = original.rows.map((row, rowIndex) => {
    const llmRow = llmAttributes.rows[rowIndex];
    const number = row[originalNumberIndex] || '';
    const lemma = row[originalLemmaIndex] || '';
    const llmNumber = llmRow?.[llmNumberIndex] || '';
    const llmLemma = llmRow?.[llmLemmaIndex] || '';

    if (number !== llmNumber || lemma !== llmLemma) {
      throw new Error(
        `Row mismatch at row ${rowIndex + 2}: expected (${number}, ${lemma}), got (${llmNumber}, ${llmLemma})`,
      );
    }

    const dictionaryRow = dictionary.rowsByNumber.get(number);
    if (!dictionaryRow) {
      throw new Error(
        `Missing Number ${number} for lemma ${lemma} in source/data/roots/dictionary-source-with-roots.csv`,
      );
    }

    const roots = dictionaryRow[dictionary.rootsIndex] || '';
    const rootIpm = calculateRootIpm(roots, rootIpmByName);

    const attributeValues = attributeIndexes.map((index) => llmRow?.[index] || '');

    if (!ALLOWED_IMAGEABILITY.has(attributeValues[0] || '')) {
      throw new Error(
        `Unsupported imageability "${attributeValues[0] || ''}" for (${number}, ${lemma})`,
      );
    }
    if (!ALLOWED_EMOTIONAL_VALENCE.has(attributeValues[1] || '')) {
      throw new Error(
        `Unsupported emotional_valence "${attributeValues[1] || ''}" for (${number}, ${lemma})`,
      );
    }
    if (!ALLOWED_IS_PROFANE.has(attributeValues[2] || '')) {
      throw new Error(
        `Unsupported is_profane "${attributeValues[2] || ''}" for (${number}, ${lemma})`,
      );
    }

    const dictionaryColumns = dictionaryRow
      .map((value, index) => {
        if (index === dictionary.numberIndex) {
          return number;
        }
        if (index === dictionary.lemmaIndex) {
          return lemma;
        }

        return value;
      })
      .filter((_, index) => index !== dictionary.rootsIndex);

    return [...dictionaryColumns, roots, rootIpm, ...attributeValues];
  });

  return {
    header: [
      ...dictionary.header.filter((_, index) => index !== dictionary.rootsIndex),
      'root',
      'root_IPM',
      ...ATTRIBUTE_COLUMNS,
    ],
    rows,
  };
}

ensureInputArtifactsExist();

const output = buildOutputRows();
ensureAttributesDir();
writeCsv(ARTIFACTS.extraLemmasWithAttributes, output.header, output.rows);

console.log(
  JSON.stringify(
    {
      inputLemmas: 'source/data/attributes/extra-lemmas-llm-attributes.original.csv',
      inputAttributes: 'source/data/attributes/extra-lemmas-llm-attributes.llm.csv',
      inputDictionary: 'source/data/roots/dictionary-source-with-roots.csv',
      inputRootIpm: 'source/data/roots/root-ipm.csv',
      output: 'source/data/attributes/extra-lemmas-with-attributes.csv',
      rows: output.rows.length,
    },
    null,
    2,
  ),
);
