/**
 * SMS budget (owner 2026-11-08: "many messages are sent, this could kill the KenteXa SMS budget ...
 * I mean the agent messages, not other features").
 *
 * Job SMS TO AGENTS are off by default: the new-job offer (and the seller-partner offer), "job
 * cancelled" and "job timed out". Agents get these by in-app + push, and senders call them (Piga).
 * Codes, account messages and every SMS to senders, buyers and offices are unchanged.
 * AGENT_JOB_SMS=1 brings the agent job SMS back.
 */
export function agentJobSmsOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.AGENT_JOB_SMS ?? '').trim() === '1';
}
