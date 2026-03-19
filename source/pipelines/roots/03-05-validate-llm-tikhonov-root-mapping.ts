import { ARTIFACTS, readCsvRows } from './lib.ts';

const original = readCsvRows(ARTIFACTS.llmTikhonovRootMappingOriginal);
const completed = readCsvRows(ARTIFACTS.llmTikhonovRootMappingLlm);

const originalKeyIndex = original.header.indexOf('tikhonov_root');
const completedKeyIndex = completed.header.indexOf('tikhonov_root');
const completedDecisionIndex = completed.header.indexOf('decision');
const completedRootIndex = completed.header.indexOf('root');

if (originalKeyIndex === -1 || completedKeyIndex === -1) {
  throw new Error('Expected tikhonov_root column in both original and llm files');
}
if (completedDecisionIndex === -1 || completedRootIndex === -1) {
  throw new Error('Expected decision and root columns in llm file');
}

const originalByKey = new Map<string, string[]>();
const completedByKey = new Map<string, string[]>();

for (const row of original.rows) {
  originalByKey.set(row[originalKeyIndex], row);
}
for (const row of completed.rows) {
  completedByKey.set(row[completedKeyIndex], row);
}

if (originalByKey.size !== completedByKey.size) {
  throw new Error(
    `Row count mismatch: ${originalByKey.size} in original vs ${completedByKey.size} in llm`,
  );
}

for (const [key, originalRow] of originalByKey.entries()) {
  const completedRow = completedByKey.get(key);
  if (!completedRow) {
    throw new Error(`Missing row for ${key} in ${ARTIFACTS.llmTikhonovRootMappingLlm}`);
  }

  for (let columnIndex = 0; columnIndex < original.header.length; columnIndex += 1) {
    const columnName = original.header[columnIndex];
    if (columnName === 'decision' || columnName === 'root') {
      continue;
    }
    if ((completedRow[columnIndex] || '') !== (originalRow[columnIndex] || '')) {
      throw new Error(`Modified non-LLM field "${columnName}" for ${key}`);
    }
  }

  const decision = completedRow[completedDecisionIndex] || '';
  const root = completedRow[completedRootIndex] || '';

  if (
    decision !== 'mapped'
    && decision !== 'new_root'
    && decision !== 'lemma_level_conflict'
  ) {
    throw new Error(`Unsupported decision "${decision}" for ${key}`);
  }

  if (decision === 'lemma_level_conflict' && root) {
    throw new Error(`Root must be empty for lemma_level_conflict on ${key}`);
  }

  if ((decision === 'mapped' || decision === 'new_root') && !root) {
    throw new Error(`Root is required for decision "${decision}" on ${key}`);
  }
}

console.log(
  JSON.stringify(
    {
      validated: 'source/data/roots/llm-tikhonov-root-mapping.llm.csv',
      rows: completed.rows.length,
    },
    null,
    2,
  ),
);
