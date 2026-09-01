import assert from 'node:assert/strict';
import test from 'node:test';

import { compareRussianWords, transliterate } from './lib.ts';

test('sorts е and ё as consecutive distinct letters', () => {
  const words = ['ёлка', 'ехать', 'ёж', 'енот'];

  assert.deepEqual(words.sort(compareRussianWords), ['енот', 'ехать', 'ёж', 'ёлка']);
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
