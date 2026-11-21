# Claude Handoff — Kentexa Enterprise Security / Workforce IAM V1

You are working in `keneddelly/kentexa`.

## Start here
Read the complete mission before doing any work:

- `docs/KENTEXA_ENTERPRISE_SECURITY_WORKFORCE_IAM_V1.md`

## Your assignment now
Perform **Phase 0 only: read-only current-state security reconnaissance**.

Inspect the actual repository and verifiable configuration. Produce an evidence-based audit with exact file paths, symbols, current behavior, working/partial/absent/unknown status, abuse scenarios, severity, and recommended next steps. Distinguish repository evidence from anything that requires confirmation by the owner of an external account.

Cover workforce identity, GitHub/source supply chain, hosting/infrastructure, production database access, secrets, payment/finance operations, support/logistics privileges, audit logging, and incident readiness. Build a preliminary trust-boundary map, threat model, and workforce access matrix.

## Non-negotiable constraints
- Do not implement anything in this phase.
- Do not change application code, configuration, GitHub settings, provider settings, branch protections, secrets, roles, permissions, or memberships.
- Do not run migrations or access production databases/customer data.
- Do not test, print, rotate, revoke, or regenerate credentials, tokens, keys, or sessions.
- Do not deploy, restart, or modify infrastructure.
- Do not open implementation PRs or merge changes.
- Never expose secret values or sensitive personal/customer data.
- Do not assume AWS, Render, an IdP, MFA, or any control is in place unless you verify it.
- Never target `master`.
- Do not proceed beyond Phase 0 until the product owner reviews the findings and explicitly approves a specific next phase.

## Required output
1. Current-state inventory with evidence and unknowns.
2. Trust-boundary and access-flow diagrams.
3. Workforce access matrix with environment, privilege, approval, and audit requirements.
4. Threat model and prioritized risk register.
5. Vendor-neutral target architecture with options/trade-offs.
6. Phased implementation plan with dependencies, validation, rollback, cost/operational burden, and explicit approval gates.

If repository access does not expose a fact, mark it unknown rather than guessing. End by presenting findings and waiting for owner direction.
