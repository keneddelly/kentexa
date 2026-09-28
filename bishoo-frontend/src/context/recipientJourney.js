/**
 * Pure view-model for the recipient journey card. The backend
 * (GET /super-agents/track/:tn/recipient-journey) decides the stage and whether an
 * action is valid; this module only maps that projection to what the card shows, so the
 * lifecycle rules are never re-derived in the browser.
 */

// One row per recipient-visible milestone, in order.
export const JOURNEY_STEP_KEYS = ['origin', 'transit', 'destination', 'choice', 'handover', 'done'];

// stage (from the backend) -> index of the CURRENT milestone; -1 = needs attention.
const STAGE_STEP = {
  preparing: 0,
  at_origin_hub: 0,
  in_transit: 1,
  arriving: 2,
  choose_method: 2,
  delivery_requested: 3,
  pickup_planned: 3,
  out_for_delivery: 4,
  delivered: 5,
  collected: 5,
};

export const KNOWN_STAGES = Object.keys(STAGE_STEP).concat('attention');

export function journeyView(journey) {
  if (!journey || journey.isRecipient !== true) return null;
  const stage = KNOWN_STAGES.includes(journey.stage) ? journey.stage : 'attention';
  const current = stage === 'attention' ? -1 : STAGE_STEP[stage];
  const finished = stage === 'delivered' || stage === 'collected';
  const steps = JOURNEY_STEP_KEYS.map((key, i) => ({
    key,
    state: current < 0 ? 'todo' : i < current || (finished && i === current) ? 'done' : i === current ? 'current' : 'todo',
  }));
  const holderName = journey.custody?.holderName || null;
  return {
    stage,
    steps,
    titleKey: `recipient_journey.stage_${stage}_title`,
    bodyKey: `recipient_journey.stage_${stage}_body`,
    // Only ever true when the backend says the choice is valid right now.
    canChooseMethod: journey.actions?.chooseMethod === true,
    holder: holderName ? { name: holderName, type: journey.custody?.holderType || null } : null,
    codAmount: journey.cod?.amountDue > 0 ? Number(journey.cod.amountDue) : null,
    delivery: journey.delivery
      ? { agentName: journey.delivery.agentName || null, fee: journey.delivery.fee ?? null, address: journey.delivery.address || null }
      : null,
    destinationHub: journey.destinationHub?.name ? journey.destinationHub : null,
    // SMS-code guidance is shown only in the two stages where a code can matter.
    codeNotice: stage === 'out_for_delivery'
      ? (journey.recipientCode?.agentDeliveryPending ? 'agent_sent' : 'agent_expected')
      : stage === 'pickup_planned'
        ? (journey.recipientCode?.pickupPending ? 'pickup_sent' : 'pickup_expected')
        : null,
  };
}
