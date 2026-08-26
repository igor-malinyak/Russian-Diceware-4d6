import * as fs from 'node:fs';

import { ARTIFACTS, readManualSelection } from './lib.ts';

function ensureInputArtifactExists(): void {
  if (!fs.existsSync(ARTIFACTS.manualSelectionCompleted)) {
    throw new Error(
      'Missing source/data/selection/manual-selection-completed.csv. Fill in the completed manual selection file first.',
    );
  }
}

ensureInputArtifactExists();

const selection = readManualSelection(ARTIFACTS.manualSelectionCompleted);

console.log(
  JSON.stringify(
    {
      input: 'source/data/selection/manual-selection-completed.csv',
      selectedFromS: selection.selectedFromCandidateColumns.length,
      selectedFromExtra: selection.selectedFromExtra.length,
      totalSelected:
        selection.selectedFromCandidateColumns.length + selection.selectedFromExtra.length,
      uniqueSelected: selection.uniqueSelected.length,
    },
    null,
    2,
  ),
);
