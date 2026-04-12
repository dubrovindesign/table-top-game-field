import { parseScenarioDocument } from './schema.ts';
import type { ScenarioDocument } from './types.ts';

import manifest from './data/official/index.json';

import official01 from './data/official/official-01.json';
import official02 from './data/official/official-02.json';
import official03 from './data/official/official-03.json';
import official04 from './data/official/official-04.json';
import official05 from './data/official/official-05.json';
import official06 from './data/official/official-06.json';
import official07 from './data/official/official-07.json';
import official08 from './data/official/official-08.json';
import official09 from './data/official/official-09.json';
import official10 from './data/official/official-10.json';
import official11 from './data/official/official-11.json';
import official12 from './data/official/official-12.json';
import official13 from './data/official/official-13.json';
import official14 from './data/official/official-14.json';
import official15 from './data/official/official-15.json';
import official16 from './data/official/official-16.json';
import official17 from './data/official/official-17.json';
import official18 from './data/official/official-18.json';
import official19 from './data/official/official-19.json';
import official20 from './data/official/official-20.json';

const scenarioFiles: Record<string, unknown> = {
  'official-01.json': official01,
  'official-02.json': official02,
  'official-03.json': official03,
  'official-04.json': official04,
  'official-05.json': official05,
  'official-06.json': official06,
  'official-07.json': official07,
  'official-08.json': official08,
  'official-09.json': official09,
  'official-10.json': official10,
  'official-11.json': official11,
  'official-12.json': official12,
  'official-13.json': official13,
  'official-14.json': official14,
  'official-15.json': official15,
  'official-16.json': official16,
  'official-17.json': official17,
  'official-18.json': official18,
  'official-19.json': official19,
  'official-20.json': official20,
};

function parseOfficialManifest(raw: unknown): { scenarios: string[] } {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Official scenario manifest (index.json) must be a JSON object.');
  }
  const scenarios = (raw as { scenarios?: unknown }).scenarios;
  if (!Array.isArray(scenarios) || !scenarios.every((x) => typeof x === 'string')) {
    throw new Error('Official scenario manifest must include "scenarios": string[] (file names).');
  }
  return { scenarios };
}

/**
 * Validates `raw` with {@link parseScenarioDocument} and returns the document, or throws with `label` in the message.
 */
export function validateScenarioDocumentStrict(raw: unknown, label: string): ScenarioDocument {
  const parsed = parseScenarioDocument(raw);
  if (!parsed.ok) {
    throw new Error(`${label}: ${parsed.error}`);
  }
  return parsed.value;
}

/**
 * Loads official scenarios in manifest order from `data/official/index.json`.
 * Each file is validated with {@link parseScenarioDocument}; the first failure throws.
 */
export function loadOfficialScenarioDocuments(): ScenarioDocument[] {
  const { scenarios } = parseOfficialManifest(manifest);
  const out: ScenarioDocument[] = [];
  for (const fileName of scenarios) {
    const raw = scenarioFiles[fileName];
    if (raw === undefined) {
      throw new Error(
        `Official scenario manifest references "${fileName}" but that file is not registered in the loader.`,
      );
    }
    out.push(validateScenarioDocumentStrict(raw, `Official scenario "${fileName}"`));
  }
  return out;
}
