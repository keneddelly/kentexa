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

// Walk-in and region rules, and the endpoints they call (checked against the web sources).
const pricePreview = fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/OfficePricePreview.js'), 'utf8');
const regionFile = fs.readFileSync(path.join(root, 'bishoo-frontend/src/utils/regionMatch.js'), 'utf8');
const locationInput = fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/IntelligentLocationInput.js'), 'utf8');
const allWeb = page + pricePreview + regionFile + locationInput;
need(`REASON_MIN = ${rules.walkIn.reasonMinLength}`, 'walk-in reason minimum', pricePreview);
need(rules.regionMatch.separatorsPattern, 'region separators', regionFile);
need(rules.regionMatch.stripPattern, 'region strip words', regionFile);
for (const ep of ['/super-agents/me/price-quote', '/super-agents/offline-intercity', '/super-agents/hubs/', '/super-agents/route/', '/pricing/estimate', '/location-intelligence/places']) {
  need(ep, `endpoint ${ep}`, allWeb);
}

// Status modal, local dispatch and handover rules.
const sm = rules.statusModal;
for (const x of sm.preDispatchStatuses) need(`'${x}'`, `pre-dispatch status ${x}`);
for (const o of [...sm.originOptions, ...sm.destinationOptions]) need(`['${o.value}',`, `status option ${o.value}`);
need(`${sm.pickupCodeLength}`, 'pickup code length', page);
need(`/^\\d{${sm.pickupCodeLength}}$/`, 'pickup code pattern');
// Endpoints: every fixed path segment must appear in the web sources (placeholders like :id are skipped).
const segs = (ep) => ep.split(' ')[1].split('?')[0].split('/').filter((x) => x && !x.startsWith(':'));
for (const ep of Object.values(sm.endpoints).concat([rules.localDispatch.dispatchEndpoint, rules.handover.acceptEndpoint])) {
  for (const seg of segs(ep)) need(seg, `endpoint ${ep} segment ${seg}`, allWeb);
}
need(`'${rules.localDispatch.defaultTransportType}'`, 'local dispatch default transport', page);
for (const seg of segs(rules.handover.listEndpoint)) need(seg, 'handover list endpoint', allWeb);
for (const seg of segs(rules.localDispatch.agentsEndpoint)) need(seg, 'agents endpoint', allWeb);

// Prices and pickup (Phase A).
const pr = rules.pricing;
const priceFiles = allWeb + fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/OfficePickupCard.js'), 'utf8') + fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/ChargeRuleSection.js'), 'utf8') + fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/OfficePrices.js'), 'utf8') + fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/RouteRangePanel.js'), 'utf8');
for (const [k, lbl] of pr.goodsTypes) need(`'${k}'`, `goods type ${k}`, priceFiles);
for (const [k, lbl] of pr.pickupModes) need(`'${k}'`, `pickup mode ${k}`, priceFiles);
need(`valuePercent: '${pr.valueDefaults.valuePercent}'`, 'default value percent', priceFiles);
need(`valueMinimum: '${pr.valueDefaults.valueMinimum}'`, 'default value minimum', priceFiles);
need(`estimatedDays: ${pr.routeDefaults.estimatedDays}`, 'default route days', priceFiles);
for (const ep of Object.values(pr.endpoints)) for (const seg of segs(ep)) need(seg, `pricing endpoint ${ep} segment ${seg}`, priceFiles);

// Partners, referrals, track and receipt (Phase B).
const pt = rules.partners;
const partnerFiles = allWeb + ['InviteCarrier.js','OfficePartners.js'].map((f) => fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components', f), 'utf8')).join('');
need('Jiunge KenteXa kama', 'invite wording', partnerFiles);
need('?join=${role === \'office\' ? \'office\' : \'transport\'}', 'invite join parameter', partnerFiles);
need("'ofisi ya mizigo'", 'invite label office', partnerFiles);
for (const [k, lbl] of pt.inviteRoles) need(lbl, `invite role ${k}`, partnerFiles);
for (const [k, [lbl]] of Object.entries(pt.referralStatusLabels)) need(`${k}: ['${lbl}'`, `referral status ${k}`, page);
need('https://kentexa.com/?ref=', 'referral link', page);
for (const ep of Object.values(pt.endpoints)) for (const seg of segs(ep)) need(seg, `partner endpoint ${ep} segment ${seg}`, allWeb + partnerFiles);

// Profile editing (native settings must save the same fields the web saves).
const pf = rules.profile;
const settings = fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/pages/SuperAgentSettings.js'), 'utf8');
need("api.patch('/super-agents/my-profile', {", 'profile patch call', settings);
need('businessName: form.businessName, phone: form.phone, address: form.address', 'profile saved fields', settings);
need("api.patch('/super-agents/my-profile/location'", 'profile location patch', settings);
for (const f of pf.editableFields) need(`${f}:`, `profile field ${f}`, settings);
for (const ep of Object.values(pf.endpoints)) for (const seg of segs(ep)) need(seg, `profile endpoint ${ep} segment ${seg}`, allWeb + settings);

// Shipment payments (send-form parcels received here; the office's own record).
const sp = rules.shipmentPayments;
const payments = fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/OfficeShipmentPayments.js'), 'utf8');
need(sp.sectionTitle, 'payments section title', payments);
need(sp.saveLabel, 'payments save label', payments);
for (const [k, lbl] of Object.entries(sp.methodLabels)) need(`${k}: '${lbl}'`, `payment method ${k}`, payments);
need(`reference: method === 'mobile_money'`, 'reference only for mobile money', payments);
need(sp.endpoints.pending.split(' ')[1], 'pending endpoint', payments);
need(`api.post('${sp.endpoints.record.split(' ')[1]}'`, 'record endpoint', payments);
need(`useState('${sp.defaultMethod}')`, 'default method', payments);
need('<OfficeShipmentPayments', 'payments mounted on dashboard', page);
need(sp.savedMessage.split('{number}')[0].trim(), 'saved message', payments);

// Van desk (Dar offices only on the web).
const vd = rules.vanDesk;
const vanPage = page;
need(`profile?.city?.toLowerCase().includes('${vd.cityMatch}')`, 'van desk city gate', page);
need(vd.title, 'van desk title', page);
need(vd.subtitle, 'van desk subtitle', page);
for (const lbl of Object.values(vd.queues)) need(lbl, `van queue ${lbl}`, page);
for (const msg of Object.values(vd.emptyMessages)) need(msg, 'van empty message', page);
for (const msg of Object.values(vd.messages)) need(msg, 'van message', page);
for (const lbl of Object.values(vd.buttons)) need(lbl, 'van button', page);
for (const ep of Object.values(vd.endpoints)) for (const seg of segs(ep)) need(seg, `van endpoint ${ep} segment ${seg}`, page);
need('hub-release:', 'van idempotency key prefix', page);
need(':stop:', 'van idempotency key stop segment', page);
need('displayParcelNumber(p)', 'van parcel number helper', page);

// Batch shehena (single-parcel shehena stays web-only).
const sh = rules.shehena;
const shehenaFiles = page + fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/ShehenaHandover.js'), 'utf8') + fs.readFileSync(path.join(root, 'bishoo-frontend/src/public/components/ShehenaTransportPicker.js'), 'utf8');
for (const [k, lbl] of Object.entries(sh.receiverModes)) need(lbl, `receiver mode ${k}`, page);
for (const lbl of Object.values(sh.labels)) need(lbl.split('{')[0].trim(), `shehena label ${lbl}`, shehenaFiles);
need(sh.labels.createAction.split('{')[0].trim(), 'shehena create action', shehenaFiles);
for (const msg of Object.values(sh.messages)) need(msg.split('{')[0].trim(), `shehena message ${msg}`, shehenaFiles);
need(`code.length !== ${sh.receiveCodeLength}`, 'receive code length', shehenaFiles);
need(`reason.trim().length < ${sh.receiveReasonMinLength}`, 'receive reason minimum', shehenaFiles);
need(`slice(0, ${sh.receiveReasonMaxLength})`, 'receive reason maximum', shehenaFiles);
for (const f of sh.dispatchFields) need(f, `dispatch field ${f}`, page);
for (const ep of Object.values(sh.endpoints)) for (const seg of segs(ep)) need(seg, `shehena endpoint ${ep} segment ${seg}`, shehenaFiles + allWeb);

if (problems.length) {
  console.error('Office rules drift between shared/office-rules.json and the web page:');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}
console.log('Web office page matches shared/office-rules.json.');
