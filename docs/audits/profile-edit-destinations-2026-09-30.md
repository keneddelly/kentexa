# Profile editing destination audit

Reviewed all 128 JavaScript files under frontend public, seller, and onboarding directories, plus the application router and destination policy.

| Prompt or surface | Previous problem | Result |
| --- | --- | --- |
| Public profile Edit | Generic MyProfile settings menu | Exact-profile public editor |
| Personal completion: name, photo, username, city, bio | Read-only profile page with edit hidden behind another button | Opens edit mode and focuses the requested field |
| Missing phone on listing creation | Generic profile view | Opens phone editor |
| Account password | Generic profile view | Opens password fields |
| Personal Identity menu | No username/cover entry; business bio/location could mark personal complete | Username and cover actions; personal public fields |
| Public profile details | No complete editor for independent identities | Display name, username, photo, cover, bio, location |
| Payout method, bank, account name | CustomerProfile has no payout fields | Business payout settings using existing workspace-scoped API |
| Store payout form | Legacy account-wide payout details | Business payout settings; no account payout writes |
| Seller account checklist | MyProfile menu | Account details page |
| Store contact completion | Checks phone even when editable contact is storeWhatsApp | Recognizes storeWhatsApp |

Public editing is owner-only; backend ownership guards remain authoritative. Personal name/photo/bio/city edits use the account endpoint to synchronize the personal CommerceProfile. Business edits target only that exact public profile.

Business payout setup retains existing feature flag, owner checks, verification, and cooling-off policies. This change does not activate disabled payout functionality. No payout configuration was written during this audit.

Local test execution is unavailable in this session. Added regression tests for direct bio editing despite orders summary failure, exact business profile edits, owner rejection, payout context isolation, and field-specific completion navigation. Deployment builds must be checked.
