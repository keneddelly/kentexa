# Release process

Established by logistics repair Gate 0 (October 2026), after an audit found
reviewed fixes merged to a branch production did not deploy and 52 commits
pushed straight to the deployed branch in one afternoon.

## One deployable branch

`worktree-service-provider-profiles` is the production line. Render deploys
it. It is the GitHub default branch, so a new pull request targets it unless
someone deliberately chooses otherwise.

`master` is frozen at `77d2cb5` (the 1 September code plus #83-#85) and is
not the deployable branch. Nothing new is merged into it. Its three fixes
were checked against the production line: the two feature flags are already
on here, and the other changes build on models the repair replaces. Before
`master` is deleted or re-pointed, confirm in the Render dashboard that no
service still builds from it.

## How a change reaches production

1. Branch from `worktree-service-provider-profiles`.
2. Open a pull request back into it.
3. **Production Line CI** must pass: backend type-check, build and a real
   boot; the logistics specs on real PostgreSQL against the known-failure
   baseline; frontend tests and build.
4. Squash-merge. Render deploys the merge commit.
5. Confirm the deploy: `GET /version` on the API returns the merged commit.

A change that needs a migration or any manual production step says so in the
pull request description, and is merged only when that step can be run.

## Known-failure baseline

`.github/logistics-known-failures.txt` lists spec files that were already
failing when the repair started. CI fails on any failing spec that is not
listed, and also when a listed spec starts passing, so the list only shrinks.

## Which commit is live?

`GET https://api.kentexa.com/version` returns the commit and branch Render
built. Before Gate 0 this could only be inferred by probing for routes.
