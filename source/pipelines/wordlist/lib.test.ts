import assert from 'node:assert/strict';
import test from 'node:test';

import { transliterate } from './lib.ts';

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
