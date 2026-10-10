# Next steps — not built yet

Agreed items that are waiting for a separate "yes". Written down so they are not forgotten.

## 1. Waybill on the Super Agent counter (receipts and counter SMS)

Step 2 (waybill numbers) deliberately did **not** change the counter. Today:

- Walk-in parcels (`createOfflineIntercityOrder`) and seller drop-offs (`createSellerShipment`)
  in `src/super-agents/super-agents.service.ts` still print and SMS `KTX-ORD-{id}`.
- Each of those parcels now ALSO gets a waybill from the database automatically, and every
  counter lookup accepts it (through `ParcelReferenceInterceptor` → `resolveParcelTrackingNumber`).

Later step (needs its own yes, because it changes the counter):

- Print the waybill on the walk-in receipt and the seller drop-off receipt.
- Put the waybill in the counter's sender/receiver SMS (check SMS length and cost first).
- Show the waybill in the Super Agent dashboard parcel lists and the shehena parcel list.
- Decide which number staff should say to customers. Suggestion: the waybill for the parcel,
  KTX-ORD only for payment/order questions.
- Old numbers must keep working everywhere (they already do).

## 2. Before deploying step 2 — ORDER MATTERS

The live server runs migrations only up to `MIGRATION_RUN_UPTO=1788292800000` at start
(package.json `start:prod`). Migration `1791600000000-AddParcelWaybillNumber` will **not** run by itself.

1. Back up the live database.
2. Apply migration `1791600000000-AddParcelWaybillNumber` by hand (it only adds a column, a unique
   index, two functions and a default; it does not change existing rows).
3. Check it directly in the database (not through the API):
   - the column `parcel."waybillNumber"` exists, existing rows are NULL;
   - the default is `kentexa_generate_waybill()`;
   - a test insert in a transaction gets a number, then roll back.
4. Only then deploy the code. If the code goes out first, every query that loads a parcel fails
   ("column waybillNumber does not exist") — **including the counter**.

## 3. Other agreed follow-ups

- Intercity "Pick up from me": no pickup job is created (KNOWN_FAULTS.md #5) — build-order step 8.
- Send-form success screen must tell the truth when no pickup job exists — plan given, waiting for yes.
- Frontend default API address must not be the live site — plan given, waiting for yes.
