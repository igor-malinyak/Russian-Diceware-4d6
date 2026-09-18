import { ARTIFACTS, validateLlmArtifact } from './lib.ts';

const result = validateLlmArtifact(
  ARTIFACTS.llmRootsOriginal,
  ARTIFACTS.llmRootsLlm,
  'Number',
  ['roots'],
);

console.log(
  JSON.stringify(
    {
      validated: 'data/roots/llm-roots.llm.csv',
      rows: result.rows,
    },
    null,
    2,
  ),
);
