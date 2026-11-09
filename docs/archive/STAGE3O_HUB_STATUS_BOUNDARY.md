# Stage 3O — generic hub status boundary

This candidate is stacked on draft PRs #38–#41. It is not approved for production by itself.

The generic hub status sheet previously offered `out_for_delivery` and `delivered` for unassigned parcels. Even when a recipient selected delivery, that route had no verified physical handover and its COD branch could collect/credit money before recipient proof. The existing code-gated hub pickup and Agent handover/delivery endpoints remain authoritative.

`updateParcelStatus` now rejects those two generic status requests at entry, before parcel lookup or financial writes. The hub dashboard removes both choices and its old generic COD collection field. Verified hub pickup still takes the recipient SMS code and COD amount; selected Agent handover still issues a one-use challenge. No historical rows or schema are changed. Nonterminal hub status choices remain available.

Focused tests assert zero writes for either rejected status, including the COD release. Production remains at its earlier baseline. The separate Agent-held COD collection and cash settlement gate remains open; Agent COD delivery must stay blocked until it is designed and reviewed. This change also makes the legacy generic status COD block unreachable; removal can occur in a separate cleanup once all callers are audited.
