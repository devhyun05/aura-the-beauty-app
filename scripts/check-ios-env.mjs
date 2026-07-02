#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const swiftPackagePath = join(
  rootDir,
  "apps/mobile/node_modules/expo-modules-jsi/apple/Package.swift",
);

function run(command, args) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    };
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}`.trim();
    return { ok: false, output };
  }
}

function parseMajorMinor(text) {
  const match = text.match(/(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function isAtLeast(actual, required) {
  return (
    actual.major > required.major ||
    (actual.major === required.major && actual.minor >= required.minor)
  );
}

function versionText(version) {
  return `${version.major}.${version.minor}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (process.platform !== "darwin") {
  fail("iOS builds require macOS.");
}

if (!existsSync(swiftPackagePath)) {
  fail(
    [
      "iOS preflight failed: mobile node_modules are missing.",
      "Run: npm --prefix apps/mobile install",
    ].join("\n"),
  );
}

const packageHeader = readFileSync(swiftPackagePath, "utf8").split("\n")[0] || "";
const requiredSwift = parseMajorMinor(packageHeader) || { major: 6, minor: 2 };

const xcode = run("xcodebuild", ["-version"]);
const xcodeSelect = run("xcode-select", ["-p"]);
const swift = run("xcrun", ["swift", "--version"]);

if (!xcode.ok || !swift.ok) {
  fail(
    [
      "iOS preflight failed: Xcode command line tools are not ready.",
      xcode.output,
      swift.output,
      "Open Xcode once, accept any prompts, then run again.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const detectedSwift = parseMajorMinor(swift.output);
if (!detectedSwift) {
  fail(`iOS preflight failed: could not parse Swift version.\n${swift.output}`);
}

if (!isAtLeast(detectedSwift, requiredSwift)) {
  fail(
    [
      "iOS preflight failed: the selected Xcode is too old for this Expo SDK.",
      `Required: Swift tools ${versionText(requiredSwift)}+`,
      `Detected: ${swift.output.split("\n")[0]}`,
      `Xcode: ${xcode.output.replace(/\n/g, " / ")}`,
      xcodeSelect.ok ? `Selected developer dir: ${xcodeSelect.output}` : "",
      "",
      "Fix:",
      "1. Install or select an Xcode that includes Swift 6.2 or newer.",
      "2. Re-run: npm run mobile:ios:device",
      "",
      "This check stops before xcodebuild dumps hundreds of build lines.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
