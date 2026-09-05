import {
  ARTIFACTS,
  compareRussianWords,
  ensureWordlistDir,
  readCsvRows,
  relativeProjectPath,
  requireColumnIndex,
  transliterate,
  writeCsv,
} from './lib.ts';

const OUTPUT_HEADER = ['Number', 'word', 'transliteration', 'abbreviation'];

type WordRow = {
  number: string;
  word: string;
};

function loadWords(): WordRow[] {
  const { header, rows } = readCsvRows(ARTIFACTS.editedWords);
  const numberColumn = requireColumnIndex(
    header,
    'Number',
    ARTIFACTS.editedWords,
  );
  const wordColumn = requireColumnIndex(
    header,
    'word',
    ARTIFACTS.editedWords,
  );
  const words = rows.map((row, rowIndex) => {
    const number = (row[numberColumn] || '').trim();
    const word = (row[wordColumn] || '').trim().normalize('NFC');
    if (!number) {
      throw new Error(`Empty Number at CSV row ${rowIndex + 2}`);
    }
    if (!word) {
      throw new Error(`Empty word at CSV row ${rowIndex + 2}`);
    }

    return { number, word };
  });
  const uniqueWords = new Set(words.map(({ word }) => word));
  const uniqueNumbers = new Set(words.map(({ number }) => number));

  if (uniqueWords.size !== words.length) {
    const wordValues = words.map(({ word }) => word);
    const duplicates = [...new Set(
      wordValues.filter((word, index) => wordValues.indexOf(word) !== index),
    )];
    throw new Error(`Duplicate words in input: ${duplicates.join(', ')}`);
  }
  if (uniqueNumbers.size !== words.length) {
    throw new Error('Duplicate Number values in input');
  }

  return words.sort((left, right) => compareRussianWords(left.word, right.word));
}

function buildRows(words: WordRow[]): string[][] {
  return words.map(({ number, word }) => [number, word, transliterate(word), '']);
}

const words = loadWords();

ensureWordlistDir();
writeCsv(ARTIFACTS.wordMetadataInput, OUTPUT_HEADER, buildRows(words));

console.log(
  JSON.stringify(
    {
      input: relativeProjectPath(ARTIFACTS.editedWords),
      output: relativeProjectPath(ARTIFACTS.wordMetadataInput),
      words: words.length,
    },
    null,
    2,
  ),
);
