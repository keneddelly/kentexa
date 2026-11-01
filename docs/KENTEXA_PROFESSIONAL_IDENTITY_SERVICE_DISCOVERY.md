# Kentexa Professional Identity & Service Discovery

**Status:** Product direction and design/audit handoff — NOT approved for implementation  
**Owner:** Kentexa product owner  
**Product/UX specification:** ChatGPT  
**Implementation:** Claude  
**Reference branch:** `worktree-service-provider-profiles`

> This document records product direction only. It does not authorize code changes, migrations, role changes, category creation, PRs or deployment. Audit the existing identity, service-provider, business-profile and onboarding systems first.

## 1. Product purpose

Make Kentexa useful to professionals, skilled individuals, independent experts, service providers, businesses and organizations—not only buyers and sellers. People should be able to build professional reputation, preserve an existing personal or organization brand, participate in discussions and be discovered for relevant services.

**Core journey:** Professional Identity → Expertise → Participation → Trust → Service Discovery → Enquiry/Booking.

This initiative must connect the social/professional experience to Kentexa's existing Services domain. It must not create a disconnected professional directory or a duplicate service catalogue.

## 2. Product principles

- One Kentexa account can support personal participation and one or more authorized professional/business identities.
- Preserve the person's name and reputation, and preserve a company/agency's own brand, logo and official identity.
- A person may participate in discussions as themselves, with a professional descriptor, or as an organization only where they are authorized to represent it.
- Professional identity, account role/capability, profession/skill and service category are separate concepts. Do not overload one role enum with job titles or service categories.
- Joining discussions must not require offering a service. A professional may join to learn, share knowledge, answer questions or build connections.
- A professional service profile should be optional and can be completed after onboarding.
- Services remain authoritative for service details, coverage, availability, pricing, enquiries and bookings. Social posts are not a second service catalogue.
- Do not create a new professional social network separate from the Home Feed, profiles, Services and Inbox.

## 3. Onboarding recommendation

After account creation and basic personal profile creation, offer a short, skippable **How would you like to use Kentexa?** step.

Use selectable participation intentions rather than forcing one exclusive permanent role. Candidate choices:
- Personal use and community
- Professional / skilled individual
- Offer a service
- Business or organization
- Sell products
- Other relevant existing Kentexa capabilities

Users may select multiple choices, skip, and change their choices later. The options are onboarding guidance and capability activation—not automatically trusted permissions. Backend authorization must continue to resolve actual roles, memberships and permissions from authoritative records.

### Professional / service setup

If the user selects Professional and/or Offer a service:
1. Ask for profession or area of expertise (e.g. software developer, electrician, accountant, designer).
2. Ask whether they want to create a service profile now or do this later.
3. If continuing, show existing service categories and subcategories with search.
4. Let the user select the closest valid category and add specific skills/specialties as structured tags or descriptive details where supported.
5. If no suitable category exists, allow the user to submit a **new category suggestion** with a proposed name, description and examples.
6. Explain that a missing category suggestion is reviewed before it becomes part of the shared Kentexa taxonomy. Do not silently create a global category or publish an unreviewed taxonomy entry.
7. Allow the user to save a draft professional profile and return later.

Avoid a long mandatory form during initial signup. Ask only for the information needed to make the next step useful; collect portfolio, experience, service area, contact preferences, credentials and other details progressively.

## 4. Service taxonomy and missing-category handling

The current Services category coverage is insufficient for the breadth of professionals Kentexa wants to attract. The solution should be a governed, extensible taxonomy, not unrestricted user-created global categories.

Proposed model, subject to audit:
- Admin-managed top-level service categories and subcategories.
- Searchable existing category selection.
- Provider-entered specialties/skills that can sit under an approved category.
- A user-submitted category suggestion queue for categories genuinely absent.
- Admin review, merge/duplicate detection, naming and localization before a proposed category becomes globally selectable.
- A clear state for a suggestion: submitted, under review, accepted, merged into an existing category, or declined with an explanation where appropriate.
- Preserve the original user-entered service description if a suggestion is merged or declined, so the provider does not lose their work.
- Do not let free-text values bypass moderation, create duplicate categories or become authoritative service types automatically.

A user should still be able to create a professional identity and participate in Kentexa even if their service category is not yet available. Do not make taxonomy approval a prerequisite for community participation.

## 5. Professional identity and brand preservation

Support distinct presentation contexts without duplicating accounts:
- **Personal identity:** individual name, avatar and personal posts.
- **Professional identity:** individual name plus profession, skills, portfolio and professional credentials/experience where verified.
- **Organization identity:** company/agency/institution name, logo, description and authorized representatives.

A user may maintain multiple legitimate contexts if the existing identity architecture supports them. Each post, comment, answer or service response must clearly show the identity used to publish it. Provide a deliberate identity switch; never silently switch identities.

Organization representation requires authorization through existing membership/permission mechanisms. A person's association with a company must not automatically grant permission to post as that company. Verification badges or credentials must reflect actual verification; do not imply professional licensing or accreditation without evidence.

## 6. Professional participation and discussion

Professionals should be encouraged to create accounts and join existing Kentexa discussions:
- Answer questions and share practical experience.
- Participate in industry and community discussions.
- Showcase work, case studies and portfolios.
- Ask for advice, collaborate and build professional relationships.
- Offer services where they choose, without every discussion becoming a sales pitch.

Professional identity can appear as a contextual descriptor on discussion contributions, e.g. “Asha — Software Developer”. If posting as a company, display the organization's official identity and distinguish it from the individual representative.

Do not force professionals to publish offers, create service listings or expose contact details to participate. Apply normal feed visibility, moderation, blocking, reporting and contact preferences.

## 7. Connection to Services

The service profile should be the professional's structured supply-side presence and link to the existing Services domain:
- Profession and expertise inform discovery; approved service categories classify offered services.
- One professional may have multiple specialties or services, subject to existing service model constraints.
- Service detail, price, availability, service area, enquiries and bookings remain owned by the Services domain.
- A professional discussion or showcase may link to an existing service profile/service record.
- Relevant discovery can connect a user's expressed need to eligible service providers only within the author's visibility/contact preferences and provider's declared service capabilities.
- Do not treat every professional post or mention as an offer or lead.
- Do not expose private posts or hidden demand signals, or enable unsolicited bulk outreach.

Audit whether the existing service provider profile, category, service listing, location, enquiry/booking and business ownership models already support these relationships. Recommend reuse and minimal extensions.

## 8. Profile and discovery surfaces

Evaluate—not assume approval for—the following:
- Professional profile section on the existing user profile.
- Professional/organization identity selector on the composer and discussion replies.
- Service profile entry point from the professional profile.
- Service discovery filters using approved category, specialty, service area and provider attributes.
- Links between professional showcase posts and authoritative service records.
- Workspace management for providers, using existing service-management surfaces where appropriate.

Keep Home Feed social-first. Do not create a separate feed that fragments participation.

## 9. Required read-only audit for Claude

Read `CLAUDE.md`, `docs/KENTEXA_ROADMAP.md`, `docs/SOCIAL_ENGAGEMENT_ROADMAP.md`, `docs/KENTEXA_EXPERIENCE_TOOLS_ARCHITECTURE.md` (if present), and this document. Confirm the exact branch and working-tree state.

Audit exact paths, entities, DTOs, APIs, migrations, UI call sites, tests and authorization for:
1. Signup/onboarding/profile creation and post-signup completion flows.
2. Existing multi-role/account-role and active identity/profile architecture.
3. Personal, professional, business and organization profile capabilities.
4. Organization membership, representative permissions and verification.
5. Service provider profiles, service categories/subcategories, specialties and taxonomy administration.
6. Service listings, locations/service areas, pricing, availability, enquiries and bookings.
7. Category creation/editing, moderation, duplicate handling and admin workflows.
8. Feed posts, comments, discussion identity attribution and profile links.
9. Search/discovery and any demand-to-supply matching logic.
10. Inbox/contact permissions, notifications, blocking, reporting and abuse controls.
11. Analytics/events and existing tests.

For each capability classify working / partial / absent / unknown and cite exact paths and symbols. Verify backend enforcement, not just UI. Identify whether onboarding choices should map to existing roles, capabilities, profile types or merely user preferences. Recommend the smallest reuse-first architecture. Do not modify files during the audit.

## 10. Proposed delivery sequence (subject to audit and owner approval)

- **Phase 0 — Audit:** map onboarding, identity, service provider, category taxonomy, discovery and permissions.
- **Phase 1 — Product/UX design:** finalize onboarding choices, professional profile, identity context and category-missing flow.
- **Phase 2 — Taxonomy governance:** approve category hierarchy, specialty model, suggestion review and migration/API requirements.
- **Phase 3 — Professional identity:** enable professional profile and authorized personal/organization representation using existing identity foundations.
- **Phase 4 — Services connection:** connect professional expertise and approved categories to existing service-provider and service records.
- **Phase 5 — Participation and discovery:** improve professional participation in discussions and permission-respecting service discovery.
- **Phase 6 — Measurement and refinement:** evaluate profile completion, useful discussions, category gaps, relevant discovery, enquiries/bookings and safety outcomes.

Do not commit to implementation phases until the owner reviews audit findings and approves the design and technical specification.

## 11. Success and safety measures

Measure:
- Onboarding completion and skip/return rates.
- Professional profile creation and completion.
- Category search success, no-result rate and category suggestion volume/resolution time.
- Professional discussion participation and useful replies.
- Profile views and follows attributable to professional contributions.
- Relevant service discovery, enquiries and bookings where reliable attribution exists.
- Provider response quality and repeat participation.
- Duplicate/misclassified categories, misleading credentials, spam, reports, blocks, unwanted contact and opt-outs.

Do not optimize only for number of service listings or leads.

## 12. Approval gates

1. Claude completes the read-only audit.
2. ChatGPT prepares verified product decisions, onboarding screens and service taxonomy proposal.
3. Product owner approves the UX and category governance.
4. Product owner separately approves role/identity mapping, data model, APIs, permissions, migrations, tests and rollout.
5. Only then may Claude implement the explicitly approved scope.
6. Deployment requires separate owner approval.

**Current instruction: AUDIT ONLY. No coding, edits, migrations, branch changes, PRs or deployment.**
