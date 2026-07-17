#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import {basename, dirname, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  isPhase1ReplayArtifactExpired,
  PHASE1_REPLAY_SCHEMA_VERSION,
  validatePhase1ReplayArtifact,
} from './phase1-replay-core.mjs';
import {withPhase1ReplayFileLock} from './phase1-replay-file-store.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const safeRepoRoots = [
  resolve(repoRoot, 'local-face-measurement'),
  resolve(repoRoot, 'artifacts/face-ratio/phase1-local'),
];

function usage() {
  console.error(
    'Usage: node scripts/face-ratio/prune-phase1-replay-artifacts.mjs ' +
      '--root <directory> [--now <ISO timestamp>] [--all] [--dry-run]',
  );
}

function isWithin(path, root) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function assertSafeCleanupRoot(rootValue) {
  const resolvedRoot = resolve(rootValue);
  if (!existsSync(resolvedRoot)) {
    throw new Error(`cleanup root does not exist: ${resolvedRoot}`);
  }
  if (lstatSync(resolvedRoot).isSymbolicLink()) {
    throw new Error(`cleanup root must not be a symlink: ${resolvedRoot}`);
  }
  if (!lstatSync(resolvedRoot).isDirectory()) {
    throw new Error(`cleanup root must be a directory: ${resolvedRoot}`);
  }

  const realRoot = realpathSync(resolvedRoot);
  const touchesRepo =
    isWithin(resolvedRoot, repoRoot) || isWithin(repoRoot, resolvedRoot);
  const matchedSafeRoot = safeRepoRoots.find(safeRoot =>
    isWithin(resolvedRoot, safeRoot),
  );
  if (touchesRepo && !matchedSafeRoot) {
    throw new Error(
      'repo-local cleanup root must stay under local-face-measurement/ ' +
        'or artifacts/face-ratio/phase1-local/',
    );
  }
  if (matchedSafeRoot) {
    if (
      !existsSync(matchedSafeRoot) ||
      lstatSync(matchedSafeRoot).isSymbolicLink()
    ) {
      throw new Error(
        `repo-local cleanup boundary must be a real directory: ${matchedSafeRoot}`,
      );
    }
    const realSafeRoot = realpathSync(matchedSafeRoot);
    const realRepoRoot = realpathSync(repoRoot);
    if (
      !isWithin(realSafeRoot, realRepoRoot) ||
      !isWithin(realRoot, realSafeRoot)
    ) {
      throw new Error(
        `repo-local cleanup root escapes through a symlink: ${resolvedRoot}`,
      );
    }
  }
  return realRoot;
}

function scanTree(root) {
  const files = [];
  const directories = [];

  function visit(directory) {
    directories.push(directory);
    const entries = readdirSync(directory, {withFileTypes: true});
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`cleanup tree must not contain symlinks: ${path}`);
      }
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        throw new Error(`cleanup tree contains an unsupported entry: ${path}`);
      }
    }
  }

  visit(root);
  return {directories, files};
}

function filenameIdentifiesReplayArtifact(path) {
  const name = basename(path);
  return (
    name === 'phase1-replay.json' ||
    name.endsWith('.phase1-replay.json')
  );
}

function classifyReplayFile(path, nowUtc) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return filenameIdentifiesReplayArtifact(path)
      ? {
          error: error instanceof Error ? error.message : String(error),
          kind: 'corrupt',
        }
      : {kind: 'unrelated'};
  }

  const hasReplaySignature =
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.schemaVersion === PHASE1_REPLAY_SCHEMA_VERSION;
  if (!hasReplaySignature && !filenameIdentifiesReplayArtifact(path)) {
    return {kind: 'unrelated'};
  }

  try {
    const artifact = validatePhase1ReplayArtifact(value);
    return isPhase1ReplayArtifactExpired(artifact, nowUtc)
      ? {artifact, kind: 'expired'}
      : {artifact, kind: 'unexpired'};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      kind: 'corrupt',
    };
  }
}

function removeEmptyDirectories(directories, root) {
  for (const directory of [...directories].sort(
    (left, right) => right.length - left.length,
  )) {
    if (directory === root || !existsSync(directory)) {
      continue;
    }
    try {
      if (readdirSync(directory).length === 0) {
        rmdirSync(directory);
      }
    } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) {
        throw error;
      }
    }
  }
}

export function prunePhase1ReplayArtifacts({
  all = false,
  dryRun = false,
  nowUtc = new Date().toISOString(),
  root,
}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('root is required');
  }
  if (!Number.isFinite(Date.parse(nowUtc))) {
    throw new Error('now must be an ISO timestamp');
  }

  const cleanupRoot = assertSafeCleanupRoot(root);
  const {files} = scanTree(cleanupRoot);
  const deletedParentDirectories = new Set();
  const summary = {
    all,
    deleted: [],
    dryRun,
    ignoredFileCount: 0,
    kept: [],
    nowUtc: new Date(Date.parse(nowUtc)).toISOString(),
    root: cleanupRoot,
    wouldDelete: [],
  };

  for (const path of files) {
    const initial = classifyReplayFile(path, summary.nowUtc);
    if (initial.kind === 'unrelated') {
      summary.ignoredFileCount += 1;
      continue;
    }

    const relativePath = relative(cleanupRoot, path);
    const shouldDelete =
      initial.kind === 'expired' ||
      initial.kind === 'corrupt' ||
      (all && initial.kind === 'unexpired');
    if (!shouldDelete) {
      summary.kept.push({path: relativePath, reason: 'unexpired'});
      continue;
    }

    const reason =
      initial.kind === 'unexpired' ? 'completion' : initial.kind;
    if (dryRun) {
      summary.wouldDelete.push({path: relativePath, reason});
      continue;
    }

    withPhase1ReplayFileLock(path, () => {
      if (!existsSync(path)) {
        return;
      }
      if (lstatSync(path).isSymbolicLink()) {
        throw new Error(`refusing to delete replay symlink: ${path}`);
      }
      const current = classifyReplayFile(path, summary.nowUtc);
      const stillDeletable =
        current.kind === 'expired' ||
        current.kind === 'corrupt' ||
        (all && current.kind === 'unexpired');
      if (!stillDeletable) {
        throw new Error(
          `replay artifact changed during cleanup; refusing deletion: ${path}`,
        );
      }
      unlinkSync(path);
      let parent = dirname(path);
      while (parent !== cleanupRoot && isWithin(parent, cleanupRoot)) {
        deletedParentDirectories.add(parent);
        parent = dirname(parent);
      }
      summary.deleted.push({
        path: relativePath,
        reason:
          current.kind === 'unexpired' ? 'completion' : current.kind,
      });
    });
  }

  if (!dryRun) {
    removeEmptyDirectories([...deletedParentDirectories], cleanupRoot);
  }
  return summary;
}

function parseArgs(argv) {
  const options = {
    all: false,
    dryRun: false,
    nowUtc: undefined,
    root: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--all') {
      options.all = true;
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--root' || argument === '--now') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
      if (argument === '--root') {
        options.root = value;
      } else {
        options.nowUtc = value;
      }
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!options.root) {
    throw new Error('--root is required');
  }
  return options;
}

function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const summary = prunePhase1ReplayArtifacts({
      all: options.all,
      dryRun: options.dryRun,
      ...(options.nowUtc ? {nowUtc: options.nowUtc} : {}),
      root: options.root,
    });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    usage();
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}
