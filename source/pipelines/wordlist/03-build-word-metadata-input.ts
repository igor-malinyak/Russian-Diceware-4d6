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

const OUTPUT_HEADER = ['word', 'transliteration', 'abbreviation'];

function loadWords(): string[] {
  const { header, rows } = readCsvRows(ARTIFACTS.editedWords);
  const wordColumn = requireColumnIndex(
    header,
    'word',
    ARTIFACTS.editedWords,
  );
  const words = rows.map((row, rowIndex) => {
    const word = (row[wordColumn] || '').trim().normalize('NFC');
    if (!word) {
      throw new Error(`Empty word at CSV row ${rowIndex + 2}`);
    }

    return word;
  });
  const uniqueWords = new Set(words);

  if (uniqueWords.size !== words.length) {
    const duplicates = [...new Set(words.filter((word, index) => words.indexOf(word) !== index))];
    throw new Error(`Duplicate words in input: ${duplicates.join(', ')}`);
  }

  return words.sort(compareRussianWords);
}

function buildRows(words: string[]): string[][] {
  return words.map((word) => [word, transliterate(word), '']);
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
