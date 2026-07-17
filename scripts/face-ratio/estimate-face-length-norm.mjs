#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  buildNormCandidate,
  sha256Text,
} from './face-length-norm-contract.mjs';


function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    requireCondition(key === '--input' || key === '--output', `Unknown argument: ${key}`);
    const value = argv[index + 1];
    requireCondition(typeof value === 'string' && value.length > 0, `${key} requires a path.`);
    args[key.slice(2)] = value;
    index += 1;
  }
  requireCondition(args.input && args.output, 'Usage: --input <manifest.json> --output <candidate.json>');
  return args;
}

function readJsonFile(filePath, label) {
  const requested = path.resolve(filePath);
  requireCondition(!fs.lstatSync(requested).isSymbolicLink(), `${label} cannot be a symlink.`);
  const resolved = fs.realpathSync(requested);
  requireCondition(fs.statSync(resolved).isFile(), `${label} must be a regular file.`);
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
}

export function estimatorSourceSha256() {
  const currentPath = fileURLToPath(import.meta.url);
  const contractPath = path.join(path.dirname(currentPath), 'face-length-norm-contract.mjs');
  return sha256Text(
    `${fs.readFileSync(contractPath, 'utf8')}\n${fs.readFileSync(currentPath, 'utf8')}`,
  );
}

export function estimateManifest(manifest) {
  return buildNormCandidate(manifest, {
    estimatorSourceSha256: estimatorSourceSha256(),
  });
}

function writeCandidate(outputPath, candidate) {
  const resolved = path.resolve(outputPath);
  const parent = path.dirname(resolved);
  requireCondition(fs.existsSync(parent) && fs.statSync(parent).isDirectory(), 'Output directory is missing.');
  if (fs.existsSync(resolved)) {
    requireCondition(!fs.lstatSync(resolved).isSymbolicLink(), 'Refusing to overwrite a symlink.');
  }
  fs.writeFileSync(resolved, `${JSON.stringify(candidate, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
    mode: 0o600,
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readJsonFile(args.input, 'Estimator input');
  const candidate = estimateManifest(manifest);
  writeCandidate(args.output, candidate);
  process.stdout.write(
    `${JSON.stringify({
      status: candidate.status,
      activationEligible: candidate.activationEligible,
      output: path.resolve(args.output),
    })}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
