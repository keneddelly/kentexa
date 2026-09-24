/**
 * Canonical, write-once provenance of a Shipment's hub decision for one side
 * (Stage 2F). Deliberately import-free so the Shipment entity, the migration
 * drift test and the policy module can all share it without any coupling.
 * This is the ONLY place these strings are spelled in application code.
 */
export enum ShipmentHubSource {
  /** The sender named an eligible hub. */
  SENDER_SELECTED = 'sender_selected',
  /** Hub selection was requested and exactly one hub was eligible. */
  AUTO_SINGLE_CANDIDATE = 'auto_single_candidate',
  /** Hub selection was requested but the resolved geography has zero eligible hubs. */
  NONE_AVAILABLE = 'none_available',
  /** No hub mediation was requested for this side. */
  NOT_REQUIRED = 'not_required',
}
