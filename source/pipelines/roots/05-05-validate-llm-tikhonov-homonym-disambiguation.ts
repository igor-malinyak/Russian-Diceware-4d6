import { ARTIFACTS, validateLlmArtifact } from './lib.ts';

const result = validateLlmArtifact(
  ARTIFACTS.llmTikhonovHomonymOriginal,
  ARTIFACTS.llmTikhonovHomonymLlm,
  'Number',
  ['roots'],
);

console.log(
  JSON.stringify(
    {
      validated: 'source/data/roots/llm-tikhonov-homonym-disambiguation.llm.csv',
      rows: result.rows,
    },
    null,
    2,
  ),
);
