/**
 * Ada ya KenteXa: the pure numbers (owner approved 2026-11-03). Everything here is plain
 * arithmetic on recorded amounts; nothing is guessed.
 */
export type FeeAccountType = 'office' | 'agent' | 'seller';

export interface FeeSettings {
  officeRate: number; officeMin: number; officeCap: number; officeFree: number;
  agentRate: number; agentMin: number; agentCap: number; agentFree: number;
  marketRate: number;
  arrearsDays: number; reminderAmount: number; agentFirstMinutes: number;
  lipaNumber: string; lipaName: string; lipaBank: string;
  startAt: Date;
}

export const DEFAULT_FEE_SETTINGS: FeeSettings = Object.freeze({
  officeRate: 10, officeMin: 200, officeCap: 5000, officeFree: 20,
  agentRate: 10, agentMin: 100, agentCap: 5000, agentFree: 20,
  marketRate: 2,
  arrearsDays: 30, reminderAmount: 5000, agentFirstMinutes: 10,
  lipaNumber: '10473656887', lipaName: 'Bishoo System', lipaBank: 'CRDB',
  startAt: new Date('2026-11-03T00:00:00Z'),
}) as FeeSettings;

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Settings rows (key/value) -> typed settings; a bad or missing value keeps the default. */
export function feeSettingsFrom(rows: Array<{ key: string; value: string }>): FeeSettings {
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const d = DEFAULT_FEE_SETTINGS;
  const start = new Date(String(m.get('start_at') ?? ''));
  return {
    officeRate: num(m.get('office_rate'), d.officeRate), officeMin: num(m.get('office_min'), d.officeMin),
    officeCap: num(m.get('office_cap'), d.officeCap), officeFree: num(m.get('office_free'), d.officeFree),
    agentRate: num(m.get('agent_rate'), d.agentRate), agentMin: num(m.get('agent_min'), d.agentMin),
    agentCap: num(m.get('agent_cap'), d.agentCap), agentFree: num(m.get('agent_free'), d.agentFree),
    marketRate: num(m.get('market_rate'), d.marketRate),
    arrearsDays: num(m.get('arrears_days'), d.arrearsDays), reminderAmount: num(m.get('reminder_amount'), d.reminderAmount),
    agentFirstMinutes: num(m.get('agent_first_minutes'), d.agentFirstMinutes),
    lipaNumber: String(m.get('lipa_number') ?? d.lipaNumber), lipaName: String(m.get('lipa_name') ?? d.lipaName),
    lipaBank: String(m.get('lipa_bank') ?? d.lipaBank),
    startAt: Number.isNaN(start.getTime()) ? d.startAt : start,
  };
}

/**
 * The fee for one job. A job that earned nothing pays nothing (a parcel shipped free);
 * otherwise rate% of what was earned, at least `min`, at most `cap` (and never more than
 * what was earned). Whole shillings.
 */
export function jobFee(base: number, rate: number, min = 0, cap = Infinity): number {
  const earned = Number(base);
  if (!Number.isFinite(earned) || earned <= 0 || !(rate > 0)) return 0;
  const raw = (earned * rate) / 100;
  const withMin = Math.max(raw, min);
  return Math.round(Math.min(withMin, cap, earned));
}

export function ruleFor(type: FeeAccountType, s: FeeSettings) {
  if (type === 'office') return { rate: s.officeRate, min: s.officeMin, cap: s.officeCap };
  if (type === 'agent') return { rate: s.agentRate, min: s.agentMin, cap: s.agentCap };
  return { rate: s.marketRate, min: 0, cap: Infinity };
}

/**
 * What the account owes now, and whether part of it is older than `arrearsDays`.
 * Payments pay the oldest fees first. The old debt from before the new rule (legacy) counts
 * as a fee made on the start day.
 */
export function owedState(
  fees: Array<{ fee: number; doneAt: Date | string }>,
  confirmedPaid: number,
  legacy: number,
  startAt: Date,
  arrearsDays: number,
  now = new Date(),
) {
  const all = [
    ...(legacy > 0 ? [{ fee: legacy, at: startAt.getTime() }] : []),
    ...fees.map((f) => ({ fee: Number(f.fee) || 0, at: new Date(f.doneAt).getTime() })),
  ].sort((a, b) => a.at - b.at);
  const total = all.reduce((s, f) => s + f.fee, 0);
  const paid = Math.max(0, Number(confirmedPaid) || 0);
  const owed = Math.max(0, Math.round(total - paid));
  const limit = now.getTime() - arrearsDays * 86_400_000;
  const oldTotal = all.filter((f) => f.at < limit).reduce((s, f) => s + f.fee, 0);
  return { owed, inArrears: oldTotal - paid > 0.5 };
}
