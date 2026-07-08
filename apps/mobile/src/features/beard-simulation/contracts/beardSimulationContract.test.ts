/**
 * Data-driven contract test over the shared fixtures in ./fixtures.
 * The fixtures directory is passed as argv[2] by
 * scripts/mobile/run-beard-simulation-contract.mjs (the compiled test runs
 * from a temp outDir, so no relative-path assumptions are allowed here).
 * The Python mirror (tools/beard-simulation-lab/tests/test_contracts.py)
 * consumes the same fixtures.
 *
 * Node builtins are accessed via declared require so this file typechecks
 * inside the app's tsconfig (no @types/node), matching the brow test pattern.
 */
import {
  validateConsultQuestions,
  validateMaskPackage,
  validateRequest,
  validateResult,
} from './validate';
import type {ValidationOutcome} from './validate';

declare const process: {argv: string[]; exit(code?: number): never};
declare function require(id: string): unknown;

const fs = require('fs') as {
  readdirSync(dir: string): string[];
  readFileSync(file: string, encoding: string): string;
};
const path = require('path') as {join(...parts: string[]): string};

function ensure(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

interface ContractFixture {
  kind: 'request' | 'result' | 'maskPackage' | 'consultQuestions';
  expectValid: boolean;
  expectErrorContains?: string;
  payload: unknown;
}

const fixturesDir = process.argv[2];
ensure(!!fixturesDir, 'usage: node beardSimulationContract.test.js <fixturesDir>');

const validators: Record<
  ContractFixture['kind'],
  (input: unknown) => ValidationOutcome
> = {
  request: validateRequest,
  result: validateResult,
  maskPackage: validateMaskPackage,
  consultQuestions: validateConsultQuestions,
};

const fixtureFiles = fs
  .readdirSync(fixturesDir)
  .filter(name => name.endsWith('.json'));
ensure(fixtureFiles.length >= 5, 'expected at least 5 contract fixtures');

for (const name of fixtureFiles) {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, name), 'utf8'),
  ) as ContractFixture;
  const validator = validators[fixture.kind];
  ensure(!!validator, `${name}: unknown fixture kind "${fixture.kind}"`);

  const outcome = validator(fixture.payload);
  ensure(
    outcome.valid === fixture.expectValid,
    `${name}: expected valid=${fixture.expectValid}, got ${outcome.valid}` +
      (outcome.errors.length ? `\n  errors: ${outcome.errors.join('; ')}` : ''),
  );
  if (fixture.expectErrorContains) {
    const haystack = outcome.errors.join('\n').toLowerCase();
    ensure(
      haystack.includes(fixture.expectErrorContains.toLowerCase()),
      `${name}: expected an error containing "${fixture.expectErrorContains}", got:\n  ${outcome.errors.join('; ')}`,
    );
  }
}

console.log(
  `beard-simulation contract: ${fixtureFiles.length} fixtures validated OK`,
);
