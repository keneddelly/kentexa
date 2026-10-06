#!/usr/bin/env node
/**
 * Ratchet for a test suite that already has known failures.
 *
 * Usage: node scripts/ci/jest-baseline.js <jest-json-output> <baseline-file> [title]
 *
 * The logistics suites had pre-existing failing spec files before the
 * repair mission started. Requiring "everything green" would make the
 * check useless on day one; ignoring failures would hide regressions.
 * This script fails the build only when a spec file that is NOT listed in
 * the baseline fails, and it also fails when a baselined file now passes
 * (so the baseline can only ever shrink).
 *
 * It prints a Markdown summary to stdout for the pull request comment.
 */
const fs = require('fs');
const path = require('path');

const [, , jsonPath, baselinePath, titleArg] = process.argv;
const title = titleArg || 'Logistics tests';
if (!jsonPath || !baselinePath) {
  console.error('usage: jest-baseline.js <jest.json> <baseline.txt>');
  process.exit(2);
}
if (!fs.existsSync(jsonPath)) {
  console.log(`### ${title}\n\nJest produced no result file — the run crashed before reporting.`);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const baseline = new Set(
  (fs.existsSync(baselinePath) ? fs.readFileSync(baselinePath, 'utf8') : '')
    .split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean),
);
const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join('/');

const failed = [];
const passed = [];
for (const suite of report.testResults || []) {
  const name = rel(suite.name);
  if (suite.status === 'failed') {
    const firstFailure = (suite.assertionResults || []).find((a) => a.status === 'failed');
    const detail = firstFailure
      ? `${firstFailure.fullName}: ${String((firstFailure.failureMessages || [''])[0]).split('\n')[0]}`
      : String(suite.message || '').split('\n').find((l) => l.trim()) || 'suite failed to run';
    failed.push({ name, detail: detail.slice(0, 300) });
  } else {
    passed.push(name);
  }
}
const newFailures = failed.filter((f) => !baseline.has(f.name));
const knownFailures = failed.filter((f) => baseline.has(f.name));
const fixed = passed.filter((p) => baseline.has(p));

const lines = [];
lines.push(`### ${title}`);
lines.push('');
lines.push(`Suites: ${report.numPassedTestSuites} passed, ${report.numFailedTestSuites} failed, ${report.numPendingTestSuites || 0} skipped. ` +
  `Tests: ${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numPendingTests || 0} skipped.`);
lines.push('');
if (newFailures.length) {
  lines.push(`**${newFailures.length} failing suite(s) not in the baseline:**`);
  for (const f of newFailures) lines.push(`- \`${f.name}\` — ${f.detail.replace(/`/g, "'")}`);
  lines.push('');
}
if (fixed.length) {
  lines.push(`**${fixed.length} baselined suite(s) now pass — remove them from \`${baselinePath}\`:**`);
  for (const f of fixed) lines.push(`- \`${f}\``);
  lines.push('');
}
if (knownFailures.length) {
  lines.push(`<details><summary>${knownFailures.length} known failing suite(s) in the baseline</summary>\n`);
  for (const f of knownFailures) lines.push(`- \`${f.name}\` — ${f.detail.replace(/`/g, "'")}`);
  lines.push('\n</details>');
}
if (!newFailures.length && !fixed.length) lines.push('No new failures against the baseline.');
console.log(lines.join('\n'));
process.exit(newFailures.length || fixed.length ? 1 : 0);
