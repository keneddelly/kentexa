/**
 * Must an agent be "online" to be offered jobs? (owner 2026-10-25)
 *
 * "KenteXa should stop waiting for the agent to be online: the nearby agent should
 * see the job. For now, while KenteXa is new, no agent will remember to go online
 * or offline." So by default every approved agent in the city is offered nearby
 * jobs (online agents still first). Set AGENT_ONLINE_REQUIRED=1 to require it again.
 */
export function agentOnlineRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.AGENT_ONLINE_REQUIRED ?? '').trim() === '1';
}

/** SQL condition for an agent alias: empty unless online is required. */
export function agentOnlineSql(alias = 'a', env: NodeJS.ProcessEnv = process.env): string {
  return agentOnlineRequired(env) ? `AND ${alias}."isOnline" = true` : '';
}
