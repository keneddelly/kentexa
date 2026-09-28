import { journeyView, KNOWN_STAGES, JOURNEY_STEP_KEYS } from './recipientJourney';
import en from '../locales/en.json';
import sw from '../locales/sw.json';
import fr from '../locales/fr.json';

const base = { isRecipient: true, status: 'received_at_hub', custody: null, destinationHub: null, delivery: null,
  cod: null, recipientCode: { agentDeliveryPending: false, pickupPending: false }, actions: { chooseMethod: false } };
const stateOf = (v) => v.steps.map(s => `${s.key}:${s.state}`).join(' ');

describe('journeyView (maps the backend projection; never re-derives lifecycle rules)', () => {
  test('non-recipient / missing projection renders nothing', () => {
    expect(journeyView(null)).toBeNull();
    expect(journeyView({ isRecipient: false })).toBeNull();
    expect(journeyView({ stage: 'delivered' })).toBeNull();
  });

  test('KTX-ORD-3 at the origin hub: shows current custody + COD, and NO recipient action', () => {
    const v = journeyView({ ...base, stage: 'at_origin_hub',
      custody: { kind: 'origin_hub_received', holderType: 'super_agent', holderName: 'Stage3KR Kariakoo Hub' },
      cod: { amountDue: 50000 } });
    expect(v.stage).toBe('at_origin_hub');
    expect(v.canChooseMethod).toBe(false);
    expect(v.holder).toEqual({ name: 'Stage3KR Kariakoo Hub', type: 'super_agent' });
    expect(v.codAmount).toBe(50000);
    expect(v.codeNotice).toBeNull();
    expect(stateOf(v)).toBe('origin:current transit:todo destination:todo choice:todo handover:todo done:todo');
  });

  test('the choose action appears only when the backend says so (strict true)', () => {
    expect(journeyView({ ...base, stage: 'choose_method', actions: { chooseMethod: true } }).canChooseMethod).toBe(true);
    for (const bad of ['true', 1, undefined, null]) {
      expect(journeyView({ ...base, stage: 'choose_method', actions: { chooseMethod: bad } }).canChooseMethod).toBe(false);
    }
    // stages that are not choose_method never enable it on their own
    for (const stage of ['preparing', 'at_origin_hub', 'in_transit', 'arriving', 'delivery_requested', 'pickup_planned', 'out_for_delivery', 'delivered', 'collected']) {
      expect(journeyView({ ...base, stage }).canChooseMethod).toBe(false);
    }
  });

  test('milestones advance through the whole path: destination → choice → handover → done', () => {
    expect(stateOf(journeyView({ ...base, stage: 'in_transit' }))).toBe('origin:done transit:current destination:todo choice:todo handover:todo done:todo');
    expect(stateOf(journeyView({ ...base, stage: 'arriving' }))).toBe('origin:done transit:done destination:current choice:todo handover:todo done:todo');
    expect(stateOf(journeyView({ ...base, stage: 'choose_method' }))).toBe('origin:done transit:done destination:current choice:todo handover:todo done:todo');
    expect(stateOf(journeyView({ ...base, stage: 'delivery_requested' }))).toBe('origin:done transit:done destination:done choice:current handover:todo done:todo');
    expect(stateOf(journeyView({ ...base, stage: 'out_for_delivery' }))).toBe('origin:done transit:done destination:done choice:done handover:current done:todo');
    expect(stateOf(journeyView({ ...base, stage: 'delivered' }))).toBe('origin:done transit:done destination:done choice:done handover:done done:done');
    expect(stateOf(journeyView({ ...base, stage: 'collected' }))).toBe('origin:done transit:done destination:done choice:done handover:done done:done');
  });

  test('unknown or unusual stages fail safe to "attention" with no progress and no action', () => {
    for (const stage of ['attention', 'something_new', undefined]) {
      const v = journeyView({ ...base, stage, actions: { chooseMethod: true } });
      expect(v.stage).toBe('attention');
      expect(v.steps.every(s => s.state === 'todo')).toBe(true);
    }
  });

  test('SMS-code guidance only in the two stages where a code matters', () => {
    expect(journeyView({ ...base, stage: 'out_for_delivery', recipientCode: { agentDeliveryPending: true } }).codeNotice).toBe('agent_sent');
    expect(journeyView({ ...base, stage: 'out_for_delivery' }).codeNotice).toBe('agent_expected');
    expect(journeyView({ ...base, stage: 'pickup_planned', recipientCode: { pickupPending: true } }).codeNotice).toBe('pickup_sent');
    expect(journeyView({ ...base, stage: 'pickup_planned' }).codeNotice).toBe('pickup_expected');
    for (const stage of ['at_origin_hub', 'in_transit', 'choose_method', 'delivery_requested', 'delivered']) {
      expect(journeyView({ ...base, stage, recipientCode: { agentDeliveryPending: true, pickupPending: true } }).codeNotice).toBeNull();
    }
  });

  test('delivery details and zero COD are mapped cleanly', () => {
    const v = journeyView({ ...base, stage: 'delivery_requested', cod: { amountDue: 0 },
      delivery: { agentName: 'Stage3KR Delivery Agent', fee: 2000, address: 'Mbagala' } });
    expect(v.delivery).toEqual({ agentName: 'Stage3KR Delivery Agent', fee: 2000, address: 'Mbagala' });
    expect(v.codAmount).toBeNull();
  });
});

describe('recipient_journey locale coverage', () => {
  const enKeys = Object.keys(en.recipient_journey).sort();
  test.each([['sw', sw], ['fr', fr]])('%s has exactly the English keys', (_l, loc) => {
    expect(Object.keys(loc.recipient_journey).sort()).toEqual(enKeys);
    for (const k of enKeys) expect(String(loc.recipient_journey[k]).trim().length).toBeGreaterThan(0);
  });
  test('every key the view-model can emit exists in every locale', () => {
    const needed = ['heading', 'choose_button', 'signin_prompt', 'signin_button', 'not_recipient', 'currently_with',
      'destination_hub', 'delivery_by', 'agreed_fee', 'cod_due',
      ...JOURNEY_STEP_KEYS.map(k => `step_${k}`),
      ...KNOWN_STAGES.flatMap(s => [`stage_${s}_title`, `stage_${s}_body`]),
      'code_agent_sent', 'code_agent_expected', 'code_pickup_sent', 'code_pickup_expected'];
    for (const loc of [en, sw, fr]) for (const k of needed) expect(loc.recipient_journey[k]).toBeTruthy();
  });
  test('placeholders are preserved in translations', () => {
    for (const k of ['currently_with', 'destination_hub', 'delivery_by', 'agreed_fee', 'cod_due']) {
      const ph = (en.recipient_journey[k].match(/\{\{\w+\}\}/g) || []).sort();
      for (const loc of [sw, fr]) expect((loc.recipient_journey[k].match(/\{\{\w+\}\}/g) || []).sort()).toEqual(ph);
    }
  });
});
