# Design Decisions

This document explains the reasoning behind the key architectural and product decisions in this
platform — the problem each one solves, what was chosen, and the trade-off that came with it.
It's organized by system concern rather than build order, so the full reasoning behind a topic
like access control lives in one place instead of being scattered across a timeline.

---

## Multi-Tenancy & Isolation

### Shared schema vs. schema-per-tenant

Schema-per-tenant is the more airtight-looking option, but it multiplies operational cost with
every new customer — every migration runs N times, every connection pool has to account for N
schemas, monitoring has to aggregate across N databases. A shared schema with an `org_id` column
on every tenant-scoped table gets the same isolation guarantee at a fraction of the operational
overhead, as long as that boundary is enforced consistently everywhere, which is what the next two
decisions are about.

### Hibernate filter vs. manual per-method scoping

Manually adding `WHERE org_id = ?` to every repository method depends entirely on developer
discipline — it works until someone writes a new query and forgets the check, and that one missed
call is a cross-tenant data leak. A Hibernate `@Filter` applied at the session level closes that
gap by enforcing the boundary automatically before any query runs, so there's one enforcement
point instead of one per method, and it can't be skipped by an oversight in a future endpoint.

### 404 instead of 403 for cross-tenant access

A 403 on a cross-tenant request confirms the resource exists but the caller can't see it — exactly
the signal an attacker needs to enumerate valid IDs across tenants they don't belong to. A 404
gives them nothing; a resource in another org looks identical to one that doesn't exist. It's a
small departure from strict REST semantics (403 is the "correct" code for an authorization
failure), but resource existence itself is sensitive in a multi-tenant system, and that's worth
more than technical purity.

---

## Access Control (RBAC)

### Data-driven RBAC instead of hardcoded roles

Hardcoded roles (`ADMIN`/`USER`/`VIEWER` as enums) mean every change to who-can-do-what requires a
code change and a redeploy. Roles and permissions are database rows instead, assigned through the
API at runtime, so an org admin can define their own roles and hand out exactly the access each one
needs without touching the application — closer to how real SaaS platforms actually work: the
platform enforces the rules, the customer defines them.

### A single, transferable Admin

Multiple Admins per org avoids a single point of failure but creates a coordination problem if two
disagree. A permanently fixed Admin avoids that but has no recovery path if that person leaves. The
middle ground — exactly one Admin at a time, explicitly transferable — keeps "there is always one
Admin" simple while still allowing succession; `transferAdmin` assigns the new Admin and removes
the role from the old one in a single transaction, so the org is never without one, even briefly.
The outgoing Admin isn't auto-assigned a replacement role, on purpose — the transfer only knows the
Admin role is moving, not whether that person is staying on with reduced access or leaving
entirely, and guessing would get it wrong in one of those two cases.

### Admin immutability enforced in the service layer, not the UI

The frontend disables the controls for modifying Admin's permissions, but that's convenience, not
security — nothing stops a direct API call from reaching those endpoints regardless of what the UI
shows. The actual guard lives in `RoleService`, checked against the role's name before any mutation
goes through, so the rule holds no matter which client is asking.

### Permissions re-checked from the database on every request, not trusted from the JWT

A JWT's signature is enough to prove identity without a database round trip, but permissions are
mutable, revocable state, not a fixed fact about a user. Trusting a permission set baked into the
token at login time means a user demoted mid-session keeps acting on stale access until their token
expires. This showed up directly during testing: after transferring Admin away from a user, their
old JWT still claimed `"roles": ["Admin"]`, but their next request to an admin-only endpoint
correctly returned 403, because permissions are resolved fresh from the database on every request.
The cost is one extra indexed join per call — a small price for making revocation immediate instead
of dependent on token expiry.

### Role deletion blocks on members instead of cascading

AWS IAM refuses to delete a role that's still attached to anything; GitHub Teams and Okta Groups
will cascade a deletion and quietly strip access from every member. Cascading doesn't fit here
because of an existing invariant — every user must hold at least one role — so a cascade would
either silently break that rule for anyone whose only role was the one being deleted, or need to
run the same "would this leave someone at zero roles" check anyway, just automatically and with
less room for a single click to be reversible. Blocking the delete until members are unassigned
mirrors the AWS IAM model without adding real complexity.

### Empty-permission roles as a valid state

A role can hold zero permissions, both at creation and after its last one is removed. This mirrors
the empty-policy-object pattern in AWS IAM and Kubernetes RBAC, and it's genuinely useful here — it's
the landing role for a demoted Admin, who needs to hold some role to satisfy the "at least one role"
invariant without that role granting anything.

---

## Onboarding & Identity

### Invitation-only onboarding

There's no open registration endpoint for individual users — the only way into an org is an
invitation from someone holding `USER_INVITE`. This keeps the org boundary strict by construction:
an account can't exist inside a tenant unless someone with the authority to add members chose to.

### One role per invitation, not several

Least privilege is the main driver — a new member should start with what their initial role
actually needs, not an accumulated bundle decided before they've joined. It also keeps onboarding to
one clear decision instead of a miniature permission-management flow, and separates concerns
cleanly: inviting someone is about bringing them in, granting more access afterward is ongoing
management, and that tooling already exists (`POST /api/roles/{roleId}/assign/{userId}`).

### Neither invite nor accept allows the Admin role

Neither endpoint originally checked whether an invitation's role was Admin — a real gap, not a
design choice — meaning the single-Admin invariant enforced everywhere else had a completely
unguarded side door. Anyone with `USER_INVITE` could invite someone straight into Admin, silently
producing a second one. The fix mirrors the pattern used for Admin's permission immutability:
`sendInvitation` rejects an Admin-role invite at send time, and `acceptInvitation` re-checks
independently at accept time, covering the edge case where a role gets renamed to "Admin" in
between. A reminder that a full test suite passing doesn't mean every *absence* of a guard has been
checked.

### Accept-invitation returns a JWT immediately

The invitation token already proves the caller was legitimately invited, so requiring a separate
login right after account creation adds friction without adding security. Account creation and JWT
issuance happen inside one transactional block.

### Deactivate instead of hard-delete

A user's ID is referenced from audit log entries, resource ownership, and invitation history, all
of which need to stay intact after they leave. Hard-deleting the row would violate a foreign key
constraint or leave those records pointing at a nonexistent user, corrupting the audit trail.
Setting `status = DISABLED` blocks login while keeping every reference intact — the same approach
Slack or GitHub take when removing someone from a workspace without deleting their history.

### A generic "invalid credentials" message for disabled accounts

A disabled user gets the same error as a wrong password, not a distinct "account disabled" message
— a distinct message would let anyone probing the login endpoint confirm that an email exists and
is specifically disabled. The cost is a slightly less helpful error for the disabled user, who'd
need to contact their admin regardless.

---

## Rate Limiting

### Redis instead of an in-memory counter

An in-memory counter only works with one instance of the application. Behind a load balancer with
multiple replicas, each instance tracks its own count, and an org could receive several times its
intended limit just by having requests land on different instances. Redis gives every instance a
single shared source of truth, which is why most production rate limiters work the same way.

### Token bucket instead of a fixed window

A fixed window resets entirely at a clock boundary, creating a spike problem — a full quota at the
end of one window plus a full quota at the start of the next briefly doubles the effective rate. A
token bucket refills continuously, so there's no instant where the available quota jumps, and it
naturally tolerates short legitimate bursts without needing a separate allowance for them.

### Rate limits aren't self-service

`requestLimitPerMinute` lives on the `Organization` entity but is deliberately not exposed through
an update endpoint — if an org could raise its own limit, the limiter wouldn't limit anything. In a
real product this would be tied to a billing plan and changed internally, not through a
self-service call. Every org currently starts at the same default of 100 requests per minute.

### The usage endpoint doesn't consume its own quota

`GET /api/usage` is excluded from rate limiting, since checking remaining quota shouldn't cost
quota — otherwise a client checking responsibly before sending a burst would be penalized for it.
GitHub's rate limit status endpoint follows the same rule.

---

## Auditability

### AOP-based logging instead of manual calls in each service method

An AOP `@AfterReturning` advice logs every mutation automatically after a controller method returns
successfully, rather than each service method calling an audit logger by hand. Manual logging mixes
a cross-cutting concern into business logic, and it only takes one new endpoint where someone
forgets the call for the audit trail to have a silent gap. The aspect either fires or it doesn't —
it doesn't depend on anyone remembering to wire it in. The one exception is `USER_JOINED`, logged
manually inside `acceptInvitation`, since that endpoint is public by necessity and has no
authenticated principal for the aspect to read an actor from.

### Revoking an invitation deletes the row instead of adding a REVOKED status

The `InvitationStatus` enum only tracks states that matter for business logic — whether a token can
still be used. A revoked invitation has no further use, and nothing downstream needs to distinguish
"revoked" from "gone." Growing the enum for a state that would only ever be read once, if that,
isn't worth it.

---

## API & Pagination Conventions

### Pagination stays 0-indexed in the API, even though the UI shows 1-indexed pages

Spring's `Pageable`/`Page<T>` are built around 0-indexed pages as a framework convention, and the
response's `number` field reflects that regardless of what the request uses. Shifting the API to
accept 1-indexed input would only desynchronize the request from the response. The conversion
happens once, at the UI boundary — the frontend keeps 1-indexed state for anything a human reads
and subtracts one only when building the request.

---

## Frontend Architecture Decisions

### Permission-driven rendering in a single app, not a separate admin/user split

What a user sees is determined by their actual permission set at runtime, in one React app, rather
than maintaining two parallel versions of the same screens for different access levels. This
mirrors the backend's own model — access is checked live, not baked into a separate code path.

### CSS Modules instead of shared global stylesheets

Early on, each page had its own plain `.css` file with generic class names like `.field` and
`.btn-primary`, assumed to stay page-local. Vite doesn't scope plain CSS imports, though, so once a
user navigates across pages in one session, every previously-loaded stylesheet is still active, and
identical class names collide — whichever loaded last wins. This caused a real bug: an oversized
submit button on the Invitations page that had inherited a rule from the login page's styles.
Converting every stylesheet to a CSS Module fixed it, since Vite compiles each into guaranteed-unique
class names — the standard approach once multiple independently-written stylesheets can be active
in the same DOM at once.

### Disabling inaccessible nav items instead of hiding them

A ReadOnly user clicking into a section they lacked access to used to hit a page that failed to
load anything, with no explanation. Hiding the nav item instead has its own problem — a user can't
tell a feature exists or what permission would unlock it. The sidebar shows every item but disables
the ones the current user can't reach, with a tooltip explaining why, so the product's full surface
is visible without ever routing someone to a page guaranteed to fail.

### Resolving permission IDs dynamically instead of hardcoding them

The Role Detail screen needs the numeric ID behind each permission code, but no endpoint returns the
full catalog with IDs directly. An early version hardcoded that mapping based on the order one
example response happened to return them in, which caused a confusing bug — toggling a permission
on worked, but off failed, because a hardcoded ID didn't match its real seeded value. Since Admin
always holds every permission by design, it's a reliable source of truth instead: the frontend
fetches Admin's permission list once per page load and builds the mapping from that, rather than
trusting a hand-typed guess that can silently drift from what the backend actually seeded.
