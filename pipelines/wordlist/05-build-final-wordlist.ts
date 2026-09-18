import {
  ARTIFACTS,
  ensureWordlistDir,
  formatDiceCode,
  formatNumericCode,
  isOrderedSubsequence,
  readCsvRows,
  relativeProjectPath,
  requireColumnIndex,
  writeCsv,
} from './lib.ts';

const WORD_COUNT = 6 ** 4;
const NUMERIC_CODE_COUNT = 1000;
const OUTPUT_HEADER = [
  'Dices',
  'Word',
  'Transliteration',
  'Abbreviation',
  'Numeric code',
];

type WordMetadata = {
  number: string;
  word: string;
  transliteration: string;
  abbreviation: string;
};

function requireUniqueValues(
  values: string[],
  fieldName: string,
  filePath: string,
): void {
  const duplicates = [...new Set(
    values.filter((value, index) => values.indexOf(value) !== index),
  )];

  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate ${fieldName} values in ${relativeProjectPath(filePath)}: ${duplicates.join(', ')}`,
    );
  }
}

function loadWordMetadata(): WordMetadata[] {
  const { header, rows } = readCsvRows(ARTIFACTS.wordMetadataCompleted);
  const columns = {
    number: requireColumnIndex(header, 'Number', ARTIFACTS.wordMetadataCompleted),
    word: requireColumnIndex(header, 'word', ARTIFACTS.wordMetadataCompleted),
    transliteration: requireColumnIndex(
      header,
      'transliteration',
      ARTIFACTS.wordMetadataCompleted,
    ),
    abbreviation: requireColumnIndex(
      header,
      'abbreviation',
      ARTIFACTS.wordMetadataCompleted,
    ),
  };
  const metadata = rows.map((row, rowIndex) => {
    const values: WordMetadata = {
      number: (row[columns.number] || '').trim(),
      word: (row[columns.word] || '').trim().normalize('NFC'),
      transliteration: (row[columns.transliteration] || '').trim(),
      abbreviation: (row[columns.abbreviation] || '').trim(),
    };

    for (const [fieldName, value] of Object.entries(values)) {
      if (!value) {
        throw new Error(`Empty ${fieldName} at CSV row ${rowIndex + 2}`);
      }
    }
    if (!/^[a-z]{3}$/u.test(values.abbreviation)) {
      throw new Error(
        `Abbreviation must contain three lowercase Latin letters at CSV row ${rowIndex + 2}`,
      );
    }
    if (values.abbreviation[0] !== values.transliteration[0]) {
      throw new Error(
        `Abbreviation must start with the first transliteration letter at CSV row ${rowIndex + 2}`,
      );
    }
    if (!isOrderedSubsequence(values.abbreviation, values.transliteration)) {
      throw new Error(
        `Abbreviation letters must occur in transliteration order at CSV row ${rowIndex + 2}`,
      );
    }

    return values;
  });

  if (metadata.length !== WORD_COUNT) {
    throw new Error(`Expected ${WORD_COUNT} word metadata rows, found ${metadata.length}`);
  }

  requireUniqueValues(
    metadata.map(({ number }) => number),
    'Number',
    ARTIFACTS.wordMetadataCompleted,
  );
  requireUniqueValues(
    metadata.map(({ word }) => word),
    'word',
    ARTIFACTS.wordMetadataCompleted,
  );
  requireUniqueValues(
    metadata.map(({ abbreviation }) => abbreviation),
    'abbreviation',
    ARTIFACTS.wordMetadataCompleted,
  );

  return metadata;
}

function loadNumericCodeNumbers(): Set<string> {
  const { header, rows } = readCsvRows(ARTIFACTS.finalCandidatesSelected1000);
  const numberColumn = requireColumnIndex(
    header,
    'Number',
    ARTIFACTS.finalCandidatesSelected1000,
  );
  const numbers = rows.map((row, rowIndex) => {
    const number = (row[numberColumn] || '').trim();
    if (!number) {
      throw new Error(`Empty Number at CSV row ${rowIndex + 2}`);
    }
    return number;
  });

  if (numbers.length !== NUMERIC_CODE_COUNT) {
    throw new Error(
      `Expected ${NUMERIC_CODE_COUNT} top-word rows, found ${numbers.length}`,
    );
  }
  requireUniqueValues(numbers, 'Number', ARTIFACTS.finalCandidatesSelected1000);

  return new Set(numbers);
}

function buildRows(
  metadata: WordMetadata[],
  numericCodeNumbers: Set<string>,
): string[][] {
  const metadataNumbers = new Set(metadata.map(({ number }) => number));
  const missingNumbers = [...numericCodeNumbers].filter(
    (number) => !metadataNumbers.has(number),
  );
  if (missingNumbers.length > 0) {
    throw new Error(
      `Top-word Number values missing from completed metadata: ${missingNumbers.join(', ')}`,
    );
  }

  let numericCodeIndex = 0;
  return metadata.map((entry, index) => {
    const numericCode = numericCodeNumbers.has(entry.number)
      ? formatNumericCode(numericCodeIndex++)
      : '';

    return [
      formatDiceCode(index),
      entry.word,
      entry.transliteration,
      entry.abbreviation,
      numericCode,
    ];
  });
}

const metadata = loadWordMetadata();
const numericCodeNumbers = loadNumericCodeNumbers();
const rows = buildRows(metadata, numericCodeNumbers);

ensureWordlistDir();
writeCsv(ARTIFACTS.finalWordlist, OUTPUT_HEADER, rows);

console.log(
  JSON.stringify(
    {
      inputs: [
        relativeProjectPath(ARTIFACTS.wordMetadataCompleted),
        relativeProjectPath(ARTIFACTS.finalCandidatesSelected1000),
      ],
      output: relativeProjectPath(ARTIFACTS.finalWordlist),
      words: rows.length,
      numericCodes: numericCodeNumbers.size,
    },
    null,
    2,
  ),
);
