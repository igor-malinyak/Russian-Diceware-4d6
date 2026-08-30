import {
  ARTIFACTS,
  ensureWordlistDir,
  readCsvRows,
  relativeProjectPath,
  requireColumnIndex,
  writeCsv,
} from './lib.ts';

function loadWords(): string[] {
  const { header, rows } = readCsvRows(ARTIFACTS.finalCandidatesSelected);
  const lemmaColumn = requireColumnIndex(
    header,
    'Lemma',
    ARTIFACTS.finalCandidatesSelected,
  );
  const words = rows.map((row, rowIndex) => {
    const word = row[lemmaColumn] || '';
    if (!word.trim()) {
      throw new Error(`Empty Lemma at CSV row ${rowIndex + 2}`);
    }

    return word;
  });
  const uniqueWords = new Set(words);

  if (uniqueWords.size !== words.length) {
    const duplicates = [...new Set(words.filter((word, index) => words.indexOf(word) !== index))];
    throw new Error(`Duplicate words in input: ${duplicates.join(', ')}`);
  }

  return words;
}

const words = loadWords();

ensureWordlistDir();
writeCsv(
  ARTIFACTS.selectedWords,
  ['word'],
  words.map((word) => [word]),
);

console.log(
  JSON.stringify(
    {
      input: relativeProjectPath(ARTIFACTS.finalCandidatesSelected),
      output: relativeProjectPath(ARTIFACTS.selectedWords),
      words: words.length,
    },
    null,
    2,
  ),
);
