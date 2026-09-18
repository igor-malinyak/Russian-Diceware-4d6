import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareRussianWords,
  formatDiceCode,
  formatNumericCode,
  isOrderedSubsequence,
  transliterate,
} from './lib.ts';

test('sorts words in dictionary order with е and ё treated as equivalent', () => {
  const words = ['ёлка', 'ехать', 'ёж', 'енот'];

  assert.deepEqual(words.sort(compareRussianWords), ['ёж', 'ёлка', 'енот', 'ехать']);
  assert.equal(compareRussianWords('все', 'всё'), 0);
});

test('transliterates every Russian letter by the configured rules', () => {
  assert.equal(
    transliterate('абвгдеёжзийклмнопрстуфхцчшщьыъэюя'),
    'abvgdeyozhziyklmnoprstufhtschshshchyeyuya',
  );
});

test('uses ye for e immediately after a soft or hard sign', () => {
  assert.equal(transliterate('платье'), 'platye');
  assert.equal(transliterate('подъезд'), 'podyezd');
});

test('rejects characters outside the supported lowercase Russian alphabet', () => {
  assert.throws(() => transliterate('кот-'), /Unsupported character/u);
});

test('formats all four-dice combinations from 1111 through 6666', () => {
  assert.equal(formatDiceCode(0), '1111');
  assert.equal(formatDiceCode(5), '1116');
  assert.equal(formatDiceCode(6), '1121');
  assert.equal(formatDiceCode(1295), '6666');
  assert.throws(() => formatDiceCode(1296), /from 0 to 1295/u);
});

test('formats numeric codes from 000 through 999', () => {
  assert.equal(formatNumericCode(0), '000');
  assert.equal(formatNumericCode(42), '042');
  assert.equal(formatNumericCode(999), '999');
  assert.throws(() => formatNumericCode(1000), /from 0 to 999/u);
});

test('checks whether abbreviation letters occur in source order', () => {
  assert.equal(isOrderedSubsequence('srs', 'sherst'), true);
  assert.equal(isOrderedSubsequence('syl', 'sherst'), false);
  assert.equal(isOrderedSubsequence('aaa', 'azbaca'), true);
});
