#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  sha256Text,
  validateApproval,
  validateCandidate,
} from './face-length-norm-contract.mjs';
import {estimatorSourceSha256} from './estimate-face-length-norm.mjs';


function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    requireCondition(
      key === '--input' || key === '--candidate' || key === '--approval',
      `Unknown argument: ${key}`,
    );
    const value = argv[index + 1];
    requireCondition(typeof value === 'string' && value.length > 0, `${key} requires a path.`);
    args[key.slice(2)] = value;
    index += 1;
  }
  requireCondition(
    args.input && args.candidate,
    'Usage: --input <manifest.json> --candidate <candidate.json> [--approval <approval.json>]',
  );
  return args;
}

function readJsonFile(filePath, label) {
  const requested = path.resolve(filePath);
  requireCondition(!fs.lstatSync(requested).isSymbolicLink(), `${label} cannot be a symlink.`);
  const source = fs.readFileSync(requested);
  try {
    return {
      decoded: JSON.parse(source.toString('utf8')),
      sha256: sha256Text(source),
    };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
}

export function validateEvidence({manifest, candidate, candidateSha256, approval = null}) {
  validateCandidate(candidate, manifest, {
    estimatorSourceSha256: estimatorSourceSha256(),
  });
  let approvalValidated = false;
  if (approval !== null) {
    validateApproval(approval, candidate, {modelArtifactSha256: candidateSha256});
    approvalValidated = true;
  }
  return {
    evidenceValidated: true,
    approvalValidated,
    activationEligible: false,
    featureFlagDefault: 'off',
    reason: approvalValidated
      ? 'approval_validated_but_promotion_not_implemented'
      : 'approval_missing',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readJsonFile(args.input, 'Estimator input').decoded;
  const candidateFile = readJsonFile(args.candidate, 'Candidate');
  const approval = args.approval
    ? readJsonFile(args.approval, 'Approval').decoded
    : null;
  const result = validateEvidence({
    manifest,
    candidate: candidateFile.decoded,
    candidateSha256: candidateFile.sha256,
    approval,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
