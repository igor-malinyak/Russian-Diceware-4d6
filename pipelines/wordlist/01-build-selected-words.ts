import {
  ARTIFACTS,
  ensureWordlistDir,
  readCsvRows,
  relativeProjectPath,
  requireColumnIndex,
  writeCsv,
} from './lib.ts';

type SelectedWord = {
  number: string;
  word: string;
};

function loadWords(): SelectedWord[] {
  const { header, rows } = readCsvRows(ARTIFACTS.finalCandidatesSelected1296);
  const numberColumn = requireColumnIndex(
    header,
    'Number',
    ARTIFACTS.finalCandidatesSelected1296,
  );
  const lemmaColumn = requireColumnIndex(
    header,
    'Lemma',
    ARTIFACTS.finalCandidatesSelected1296,
  );
  const words = rows.map((row, rowIndex) => {
    const number = (row[numberColumn] || '').trim();
    const word = row[lemmaColumn] || '';
    if (!number) {
      throw new Error(`Empty Number at CSV row ${rowIndex + 2}`);
    }
    if (!word.trim()) {
      throw new Error(`Empty Lemma at CSV row ${rowIndex + 2}`);
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

  return words;
}

const words = loadWords();

ensureWordlistDir();
writeCsv(
  ARTIFACTS.selectedWords,
  ['Number', 'word'],
  words.map(({ number, word }) => [number, word]),
);

console.log(
  JSON.stringify(
    {
      input: relativeProjectPath(ARTIFACTS.finalCandidatesSelected1296),
      output: relativeProjectPath(ARTIFACTS.selectedWords),
      words: words.length,
    },
    null,
    2,
  ),
);
