#!/usr/bin/env node
// Generates mobile/src/office/officeRules.ts from shared/office-rules.json.
// Usage: node scripts/office-rules/sync-mobile.js          (write the file)
//        node scripts/office-rules/sync-mobile.js --check  (fail if the file is out of date)
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'shared/office-rules.json');
const out = path.join(root, 'mobile/src/office/officeRules.ts');
const rules = JSON.parse(fs.readFileSync(src, 'utf8'));

const body = `// GENERATED from shared/office-rules.json by scripts/office-rules/sync-mobile.js. Do not edit by hand.
/* eslint-disable */
export const OFFICE_RULES = ${JSON.stringify(
  { version: rules.version, statusLabels: rules.statusLabels, groups: rules.groups, counts: rules.counts, expectedActions: rules.expectedActions, arrival: rules.arrival, regionMatch: rules.regionMatch, walkIn: rules.walkIn, statusModal: rules.statusModal, localDispatch: rules.localDispatch, handover: rules.handover, pricing: rules.pricing, partners: rules.partners, profile: rules.profile, shipmentPayments: rules.shipmentPayments, webOnly: rules.webOnly },
  null,
  2
)} as const;
`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (current !== body) {
    console.error('mobile/src/office/officeRules.ts is out of date. Run: node scripts/office-rules/sync-mobile.js');
    process.exit(1);
  }
  console.log('Mobile office rules are up to date.');
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, body);
  console.log(`Wrote ${path.relative(root, out)}`);
}
