import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  computeFinalRankingScore,
  computeRankingScore,
  formatRankingScore,
} from './lib.ts';

const inputs = {
  lemmaIpm: 100,
  rootIpm: 400,
  imageability: 4,
  emotionalValence: 2,
  isProfane: 0,
};

describe('computeFinalRankingScore', () => {
  test('computes the score without the lemma-length factor', () => {
    assert.equal(computeFinalRankingScore(inputs), 200);
  });

  test('rejects a non-finite score', () => {
    assert.throws(
      () => computeFinalRankingScore({ ...inputs, lemmaIpm: Number.POSITIVE_INFINITY }),
      /Final ranking score is not finite/u,
    );
  });
});

describe('computeRankingScore', () => {
  test('applies the lemma-length factor only to the initial score', () => {
    assert.equal(computeRankingScore(inputs, 4), 800);
    assert.equal(computeRankingScore(inputs, 12), 200);
  });
});

describe('formatRankingScore', () => {
  test('formats scores with up to six decimal places', () => {
    assert.equal(formatRankingScore(200), '200');
    assert.equal(formatRankingScore(1.2345678), '1.234568');
  });
});
