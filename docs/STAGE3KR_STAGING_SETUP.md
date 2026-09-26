# Stage 3K–3R isolated phone rehearsal

Use `render.stage3kr.yaml` as the **custom Blueprint Path** of a new Render Blueprint instance on branch `feature/stage3kr-behavior-integration`. Review that it creates only `kentexa-stage3kr-db`, `kentexa-stage3kr-api`, and `kentexa-stage3kr-frontend`. Do not select the root `render.yaml` or import existing production resources. Keep auto deploy disabled.

The database is empty and isolated. The backend pre-deploy command applies only migrations through `1788281400000` using the Blueprint's database reference. It must report 27 migrations on first deployment and zero on a retry. The database needs the `vector` extension supported by the baseline migration; if it fails, stop and review the log. Never point this Blueprint at `kentexa-db` or `kentexa-migration-validation`.

The two custom domains require DNS and Render TLS verification: `stage3kr.kentexa.com` for the static frontend and `api-stage3kr.kentexa.com` for the backend. Wait for both before phone testing. Same-site HTTPS domains are necessary for the existing `SameSite=Lax` refresh cookie on iPhone. The temporary `.onrender.com` addresses are useful only for build/health inspection, not authenticated mobile rehearsal.

No production payment, SMS, mail, push, Cloudinary, or analytics secrets are declared. Payment providers are disabled. Do not add shared production environment groups or copy production users. Test roles and parcels require synthetic fixtures in the isolated database; real recipient SMS is a separate explicit gate with test-only credentials and numbers. The frontend's API target, push subscription, and links should be checked on the deployed build before creating test accounts.

Gate: verify both domains and the migration ledger, then rehearse hub handoff, Agent receipt, recipient proof, COD collection and admin remittance; retry, expiry, offline/reopen, role switch, and logout on iPhone and Android. Inspect service worker requests for uncached cross-origin API responses. Keep PR #47 draft until the results are recorded.
