# Kentexa Enterprise Security — Workforce IAM V1

**Status:** Architecture mission / reconnaissance first  
**Repository:** `keneddelly/kentexa`  
**Working branch:** `docs/enterprise-security-workforce-iam-v1`  
**Base branch:** `worktree-service-provider-profiles`  
**Current phase:** Phase 0 — read-only current-state audit  
**Approval boundary:** This document authorizes investigation and documentation only. It does not authorize production changes, credential rotation, infrastructure changes, permission changes, code implementation, migrations, deployment, or access revocation.

## 1. Mission

Design an enterprise-grade workforce identity and access-management (IAM) architecture for Kentexa so that access to source code, infrastructure, production systems, databases, secrets, finance, support tools, and sensitive operational capabilities is controlled, limited, reviewable, and attributable to an individual or workload identity.

The governing principle is:

> No single identity should have unrestricted control over the entire company or production environment.

Security must be designed around prevention, containment, detection, accountability, and recovery—not merely login protection.

## 2. Important scope boundary: workforce IAM is not customer IAM

Kentexa already has customer-facing identities and multi-role product concepts (for example buyer, seller, agent, super-agent, transport provider, service provider, customer care, manager, admin, arbitrator).

Do not mix employee/workforce authorization with public customer roles or reuse a customer-facing `admin` role as proof of trusted employee identity.

The mission covers internal workforce access:
- Founder / executive access
- Engineering and code-review access
- Infrastructure and deployment access
- Production database access
- Finance and payment operations
- Customer support and trust/safety operations
- Logistics operations
- Security administration and audit

Treat these as capability boundaries, not blanket job-title grants. One employee may hold multiple approved responsibilities, but high-risk combinations must be identified and controlled.

## 3. Mandatory first instruction to Claude: audit before proposing changes

Start by inspecting the repository and documenting what actually exists. Do not assume the architecture in old notes is still current.

Inspect relevant code, configuration, deployment files, GitHub workflows, migrations, authentication/authorization guards, role models, secrets references, logging, payment/refund flows, and operational tooling. Identify infrastructure from checked-in configuration and verifiable evidence. If a fact cannot be verified from the repository, label it **unknown** and state what evidence or owner confirmation is required.

For every finding, provide:
- Exact file path and relevant symbol/configuration
- What the implementation currently does
- Whether it is working, partial, absent, or unknown
- Security impact and realistic abuse scenario
- Evidence supporting the finding
- Recommended remediation, ordered by risk
- Whether remediation needs product-owner approval or external account-owner action

Do not print, copy, request, or expose secret values, tokens, private keys, passwords, signing keys, database URLs, customer personal data, or production records. If a secret is found in tracked files or history, report its location and exposure risk without reproducing its value. Do not test credentials or attempt access to external systems.

## 4. Phase 0 — current-state security reconnaissance

Produce an evidence-based inventory covering the following areas.

### A. Workforce identity and authentication
- How human team members currently authenticate to GitHub, hosting, databases, payment providers, email, domains/DNS, analytics, and other operational systems.
- Whether accounts are individual or shared.
- MFA/passkeys/security-key coverage, recovery methods, session lifetime, device/session revocation, and account recovery risks.
- Whether personal accounts or founder-owned credentials are acting as shared organizational control points.
- Current employee onboarding, role changes, offboarding, and access-review process.
- Identify orphaned, dormant, shared, and over-privileged accounts where evidence is available.

### B. GitHub and software supply chain
- Organization/repository membership and permission model, team usage, outside collaborators, deploy keys, GitHub Apps, personal access tokens, and bot identities.
- Branch protection/rulesets, required reviews, CODEOWNERS, secret scanning, dependency/security updates, signed commits where relevant, and workflow permissions.
- GitHub Actions workflow token permissions, third-party actions pinning, environment protections, deployment approvals, and secrets exposure paths.
- Separate ability to write code, approve code, change workflow/deployment configuration, and deploy production.
- Never modify repository settings or workflows during this audit.

### C. Hosting, cloud, domains, and infrastructure
- Identify the actual production/staging/development providers and account boundaries from verified configuration; do not assume AWS or Render without evidence.
- Human access versus workload/service identities.
- Deployment credentials, environment variables, secret storage, backups, DNS/domain registrar, CDN/WAF, monitoring, and recovery ownership.
- Determine whether production and non-production resources are isolated.
- Map who can deploy, change environment variables, access logs, restart services, alter networking, or delete resources.

### D. Production database and data access
- Database provider, network exposure, authentication model, TLS, roles/grants, backups, restore access, and audit capability.
- Distinguish application runtime access, developer access, read-only analytics, production investigation, DBA, and emergency access.
- Check for shared credentials, broad privileges, public exposure, and sensitive-data access paths.
- Review whether production data is copied into development/test environments and what protections apply.
- Do not connect to or query production databases during this audit.

### E. Secrets and cryptographic material
- Inventory secret categories and where references/configuration indicate they are stored (never reveal values).
- Separate human credentials, application secrets, signing keys, encryption keys, provider API keys, webhook secrets, and CI/CD credentials.
- Review rotation ownership, access boundaries, expiry, auditability, and incident response readiness.
- Identify long-lived credentials and opportunities for short-lived or federated workload identity.
- Do not rotate, revoke, regenerate, or test any secret.

### F. Finance and payment operations
- Map who can view financial data, configure payment providers, change payout/bank details, issue refunds, reconcile transactions, alter fees/commissions, and approve exceptions.
- Identify separation-of-duties gaps and dual-control opportunities.
- Trace payment/refund authority across application roles, provider dashboards, and database access.
- Never perform financial actions or alter payment configuration.

### G. Support, logistics, and privileged administration
- Map sensitive support actions: account access, identity verification, impersonation, account suspension, dispute handling, shipment overrides, and customer-data exports.
- Identify authorization checks, approval requirements, audit records, and abuse scenarios.
- Separate routine operational access from emergency/break-glass access.

### H. Audit, detection, and incident response
- Determine what authentication, authorization, privilege, deployment, database, financial, and administrative events are recorded.
- Check whether logs are centralized, access-controlled, retained, tamper-resistant, and useful for investigations.
- Identify alerting gaps and incident response ownership.
- Assess whether critical actions can be tied to a unique human or workload identity.

## 5. Target architecture to evaluate (not pre-approved vendor selection)

Evaluate an identity-centric, least-privilege design. Do not select or purchase a vendor on the owner's behalf.

### Workforce identity provider and SSO
Assess a central workforce identity provider (for example Microsoft Entra ID or Okta, or an appropriately scoped alternative) for lifecycle management, MFA/passkeys, SSO/federation, group-based access, and centralized session revocation.

SSO is an authentication and federation mechanism; it does not automatically grant authorization inside GitHub, hosting, databases, or finance systems. Each resource must enforce its own authorization.

### Strong authentication
Evaluate phishing-resistant MFA such as passkeys or hardware security keys for privileged users. Document secure recovery and lost-device procedures. Avoid relying on SMS as the sole protection for privileged access.

### Authorization
Evaluate RBAC for understandable job/capability groupings and ABAC/contextual conditions where justified. Apply least privilege, deny by default, explicit resource scope, and periodic access reviews.

### Privileged access management
Evaluate just-in-time/time-bound elevation, approval for sensitive actions, emergency access with post-use review, and strict separation between routine and privileged identities.

### Workload identities
Give APIs, workers, scheduled jobs, and CI/CD pipelines their own identities and narrowly scoped permissions. Prefer short-lived/federated credentials where supported over personal tokens or long-lived shared keys. Workloads must not impersonate a founder or employee.

### Audit and detection
Create a coherent audit trail for authentication, authorization decisions, privilege elevation, access changes, deployments, secret access, production data access, and high-risk finance/admin actions. Protect audit records from alteration by the actors being audited.

## 6. Separation-of-duties model to design

Create a proposed access matrix across at least these capabilities:
- Read source code
- Write source code
- Approve/merge code
- Change CI/CD workflow configuration
- Deploy staging
- Deploy production
- Read production logs
- Read production customer data
- Query production database
- Change production infrastructure/secrets
- Manage domain/DNS
- Configure payment providers
- View financial reports
- Prepare refunds
- Approve refunds
- Execute refunds
- Change fees/commissions
- Manage employee access
- Review security/audit logs

For each capability, specify:
1. Eligible workforce group(s)
2. Scope and environment
3. Authentication strength
4. Approval or dual-control requirement
5. Logging and alerting requirement
6. Whether access is standing or time-limited
7. Emergency path and review requirement

Explicitly identify dangerous combinations, including the ability for one person to create malicious code, approve it, deploy it, alter the logs, and change financial outcomes without independent review.

## 7. Employee lifecycle

Design joiner/mover/leaver controls:
- Joiner: approved identity, minimum group assignment, MFA enrollment, named owner, access expiry/review.
- Mover: remove old access when responsibilities change; do not only add new access.
- Leaver: promptly disable workforce identity, revoke sessions/tokens, remove organization/team access, disable workload credentials owned by the person, transfer ownership, and verify access removal across every connected system.
- Periodic review: recertify privileged and sensitive access, dormant accounts, external collaborators, service identities, and emergency accounts.

IdP deactivation alone is not enough if independent credentials or local accounts remain active.

## 8. Threat model

At minimum, model:
- Phished or stolen employee credentials
- Compromised founder/admin account
- Malicious or compromised employee/contractor
- Compromised developer workstation
- Malicious dependency or GitHub Action
- Leaked CI/CD or provider credential
- Compromised workload identity
- Unauthorized production database access or data exfiltration
- Insider changing payment/refund configuration
- Abused support impersonation or privileged admin tools
- Former employee retaining access
- Ransomware, destructive deployment, or cloud-account takeover
- Audit-log tampering or failure to detect a breach

For each threat, identify assets, trust boundaries, attack path, preventive controls, detection, containment, recovery, residual risk, and owner.

## 9. Required deliverables

Claude must produce these documents after Phase 0, keeping facts and recommendations clearly separated:

1. **Current-state security inventory** — evidence, exact paths, unknowns, external account-owner questions.
2. **Trust-boundary and access-flow diagrams** — human identities, workload identities, IdP, GitHub, hosting, database, finance, and operations.
3. **Workforce access matrix** — role/capability, resource, environment, privilege, approvals, logging.
4. **Threat model and risk register** — severity, likelihood, impact, mitigations, owner, priority.
5. **Target Workforce IAM architecture** — vendor-neutral first, then optional vendor mapping with trade-offs.
6. **GitHub and CI/CD hardening plan** — staged, non-disruptive, with rollback.
7. **Infrastructure and production-data access plan** — based on verified current providers.
8. **Finance and sensitive-operation separation-of-duties plan**.
9. **Joiner/mover/leaver and access-review procedures**.
10. **Phased implementation roadmap** — dependencies, cost/operational complexity, migration risks, validation, rollback, and explicit approvals.

## 10. Risk prioritization

Use a clear severity scale (Critical / High / Medium / Low) and explain why. Prioritize externally exploitable paths, privileged account compromise, production secrets, data exposure, destructive infrastructure access, payment manipulation, and persistent former-employee access.

Do not recommend expensive enterprise tooling without explaining the risk it solves, the simpler alternative, operational overhead, and whether Kentexa's current scale justifies it.

## 11. Strict execution guardrails

Until the product owner reviews and explicitly approves the architecture and a specific implementation phase:

- READ-ONLY reconnaissance and documentation only.
- Do not edit application code or configuration.
- Do not add authentication providers, MFA enforcement, SSO, IAM policies, guards, permissions, or database roles.
- Do not create or run migrations.
- Do not change GitHub organization/repository settings, branch protections, secrets, workflows, or access memberships.
- Do not access production databases or production customer records.
- Do not access external provider consoles or test credentials.
- Do not rotate/revoke secrets, tokens, keys, sessions, or accounts.
- Do not deploy, restart, or change production/staging infrastructure.
- Do not open implementation PRs or merge changes.
- Do not weaken existing controls to make tests pass.
- Do not assume any vendor, deployment provider, security control, or process exists without evidence.
- Never expose secret values or sensitive personal/customer data in reports.

Documentation commits for this approved mission may be made only on the dedicated feature branch. Never target `master`. Do not merge the documentation branch without owner review.

## 12. Completion criteria for Phase 0

Phase 0 is complete only when:
- Every system boundary in scope is inventoried or explicitly marked unknown.
- Findings cite exact repository evidence and distinguish code evidence from external account-owner confirmation.
- High-risk access paths and missing controls are ranked.
- A proposed target architecture and access matrix are presented.
- Implementation is broken into small, independently approvable phases.
- No production or account changes have been made.

**The next action after Phase 0 is to present findings and wait for the product owner's decision. Do not silently proceed to implementation.**
