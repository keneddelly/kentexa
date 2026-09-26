# Stage 3K–R schema-first release candidate

Production code is currently at the earlier Stage 3J baseline. The draft behavior chain #38–#45 references four new migrations. Applying runtime code before these columns and tables exist would break the Agent handover and COD paths. This branch contains only those four migration files and an isolated PostgreSQL schema test; it does not enable a new endpoint or alter the current application entities.

Ordered migrations:

1. `1788279600000` — nullable destination hub → Agent handoff challenge.
2. `1788280200000` — nullable recipient-held Agent delivery challenge.
3. `1788280800000` — nullable local Agent COD collector and immutable cash collection ledger.
4. `1788281400000` — immutable cash remittance ledger and database over-remittance limit.

Existing Orders and Parcels remain unchanged. No challenge, custody event, collection or remittance is inferred from historical rows. The test applies these migrations in order on PostgreSQL, checks historical rows remain null/default, challenge constraints, ledger insertion, the database liability limit and refusal to downgrade a nonempty remittance ledger.

Release gate after independent review: merge/deploy this schema-only change, verify the Render backend commit, inspect the production migration ledger and affected schema read-only, then explicitly run the bounded direct migration through `1788281400000` from that deployed commit. Verify exactly four new ledger entries and the new constraints/tables before merging any behavior PR. Do not run the migration against an unverified DB target or deploy the stacked behavior first. Keep the behavior PRs draft until their combined exact head is reviewed and the app flows are validated on real devices. The exact Render workspace and deployment state must be confirmed separately; this document does not assert they are already verified.
