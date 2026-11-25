#!/usr/bin/env node
// Checks that the web office page still matches shared/office-rules.json.
// Read-only: it never edits the web page. Exits 1 on any mismatch.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'shared/office-rules.json'), 'utf8'));
const page = fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/pages/SuperAgentDashboard.js'), 'utf8');
const expected = fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/HubExpectedShipments.js'), 'utf8');

const problems = [];
const need = (text, what, source = page) => { if (!source.includes(text)) problems.push(`missing in web: ${what}`); };
const list = (statuses) => `[${statuses.map((s) => `'${s}'`).join(',')}]`;
const roleTest = (role) => ({ destination: "p.myRole === 'destination'", not_destination: "p.myRole !== 'destination'", not_origin: "p.myRole !== 'origin'" })[role];

// Status labels: key and Swahili label must both appear in the STATUS_LABEL table.
for (const [key, label] of Object.entries(rules.statusLabels)) {
  need(`${key}:`, `status key ${key}`);
  need(`l: '${label}'`, `label "${label}" for ${key}`);
}

// Groups: each filter must appear exactly as the page writes it.
const groupFilters = {
  incoming: rules.groups.pokea.incoming,
  toDispatch: rules.groups.tuma.toDispatch,
  inTransit: rules.groups.tuma.inTransit,
  awaitingBuyer: rules.groups.tuma.awaitingBuyer,
};
for (const [name, g] of Object.entries(groupFilters)) {
  need(`${list(g.statuses)}.includes(p.status) && ${roleTest(g.myRole)}`, `group ${name}`);
}
need("p.status === 'delivered'", 'group delivered');

// Expected-list actions: the server's nextAction names must be handled on the web.
for (const action of ['receive_from_sender', 'receive_order', 'confirm_agent_handover', 'agent_on_the_way']) {
  need(`'${action}'`, `nextAction ${action}`, expected);
}

if (problems.length) {
  console.error('Office rules drift between shared/office-rules.json and the web page:');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log('Web office page matches shared/office-rules.json.');
