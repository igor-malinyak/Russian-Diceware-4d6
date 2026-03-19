import {
  ARTIFACTS,
  requireColumnIndex,
  readCsvRows,
} from './lib.ts';

const ALLOWED_IMAGEABILITY = new Set(['1', '2', '3', '4', '5']);
const ALLOWED_EMOTIONAL_VALENCE = new Set(['1', '2', '3', '4', '5']);
const ALLOWED_IS_PROFANE = new Set(['0', '1']);

function validateAttributeValues(): void {
  const original = readCsvRows(ARTIFACTS.llmAttributesOriginal);
  const completed = readCsvRows(ARTIFACTS.llmAttributesLlm);
  const originalNumberIndex = requireColumnIndex(original.header, 'Number', ARTIFACTS.llmAttributesOriginal);
  const originalLemmaIndex = requireColumnIndex(original.header, 'Lemma', ARTIFACTS.llmAttributesOriginal);
  const numberIndex = requireColumnIndex(completed.header, 'Number', ARTIFACTS.llmAttributesLlm);
  const lemmaIndex = requireColumnIndex(completed.header, 'Lemma', ARTIFACTS.llmAttributesLlm);
  const imageabilityIndex = requireColumnIndex(
    completed.header,
    'imageability',
    ARTIFACTS.llmAttributesLlm,
  );
  const emotionalValenceIndex = requireColumnIndex(
    completed.header,
    'emotional_valence',
    ARTIFACTS.llmAttributesLlm,
  );
  const isProfaneIndex = requireColumnIndex(
    completed.header,
    'is_profane',
    ARTIFACTS.llmAttributesLlm,
  );

  if (original.header.join('\u0000') !== completed.header.join('\u0000')) {
    throw new Error(
      'Header mismatch: source/data/attributes/llm-attributes.original.csv vs source/data/attributes/llm-attributes.llm.csv',
    );
  }
  if (original.rows.length !== completed.rows.length) {
    throw new Error(
      `Row count mismatch: ${original.rows.length} in original vs ${completed.rows.length} in llm`,
    );
  }

  for (let rowIndex = 0; rowIndex < completed.rows.length; rowIndex += 1) {
    const originalRow = original.rows[rowIndex];
    const row = completed.rows[rowIndex];
    const rowKey = row[numberIndex] || '';
    const rowLemma = row[lemmaIndex] || '';
    const imageability = row[imageabilityIndex] || '';
    const emotionalValence = row[emotionalValenceIndex] || '';
    const isProfane = row[isProfaneIndex] || '';

    if (
      (originalRow?.[originalNumberIndex] || '') !== rowKey
      || (originalRow?.[originalLemmaIndex] || '') !== rowLemma
    ) {
      throw new Error(
        `Changed non-LLM row identity at row ${rowIndex + 2}: expected (${originalRow?.[originalNumberIndex] || ''}, ${originalRow?.[originalLemmaIndex] || ''}), got (${rowKey}, ${rowLemma})`,
      );
    }
    if (!ALLOWED_IMAGEABILITY.has(imageability)) {
      throw new Error(`Unsupported imageability \"${imageability}\" for ${rowKey}`);
    }
    if (!ALLOWED_EMOTIONAL_VALENCE.has(emotionalValence)) {
      throw new Error(`Unsupported emotional_valence \"${emotionalValence}\" for ${rowKey}`);
    }
    if (!ALLOWED_IS_PROFANE.has(isProfane)) {
      throw new Error(`Unsupported is_profane \"${isProfane}\" for ${rowKey}`);
    }
  }
}

validateAttributeValues();

console.log(
  JSON.stringify(
    {
      validated: 'source/data/attributes/llm-attributes.llm.csv',
      rows: readCsvRows(ARTIFACTS.llmAttributesLlm).rows.length,
    },
    null,
    2,
  ),
);
