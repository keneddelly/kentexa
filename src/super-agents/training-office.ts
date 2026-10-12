/**
 * Training office ("ofisi ya mafunzo", migration 1791900000000). One rule for
 * every place that lists or picks Super Agent offices:
 *
 *  - Customers, sellers and transporters never see or get a training office
 *    (office pickers, automatic destination office, route stops, the no-agent
 *    card, the pending-pickup contact, referral codes).
 *  - Office-to-office choices (transfer, destination/last-mile office) stay
 *    within the same kind: a training office reaches only training offices, a
 *    real office only real ones. Training parcels never land at a real office,
 *    and trainees can still practise a full transfer between training offices.
 */
export const isTrainingOffice = (office: { isTrainingOffice?: boolean | null } | null | undefined): boolean =>
  office?.isTrainingOffice === true;

/** SQL condition: this office may be shown to customers / other businesses. */
export const CUSTOMER_VISIBLE_OFFICE = (alias: string) => `${alias}."isTrainingOffice" = false`;
