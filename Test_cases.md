# BE-Instantly-App — Test Cases

Comprehensive manual test checklist covering every module, flow, invariant, and error path in the backend.

**How to use:** work top-to-bottom per module. Each test has an ID, preconditions, steps, and expected result. Check it off when it passes. Legend: ✅ pass, ❌ fail, ⏭ skipped.

**Test accounts** (create once, reuse across tests):
- `C1` — customer, verified, no active order
- `C2` — second customer
- `S1` — supplier in category **Electrical**, governments **Cairo+Giza**, verified, no active session
- `S2` — second supplier in same category+government as S1
- `S3` — supplier in a **different** category from S1
- `ADMIN` — admin role

**Seed data required before any test run:**
- At least 2 Categories (each with ≥1 workflow containing ≥3 steps and ≥1 job title)
- At least 2 Governments
- `.env` correct: `DATABASE_URL`, Redis, RabbitMQ, Cloudinary, Twilio, JWT secrets, Gmail SMTP

---

## 0. Environment & Bootstrap

| ID | Test | Expected |
|---|---|---|
| ENV-001 | Start server with `npm run dev` | Logs: `MongoDB` → `PostgreSQL connected (Prisma)`, `RabbitMQ connected`, all 5 workers started, `SMTP transporter verified`, `Redis ready`, `Server running on port 6000` |
| ENV-002 | `GET /health` | 200 with timestamp + environment |
| ENV-003 | Hit any unknown path, e.g. `GET /api/nope` | 404 or express default error |
| ENV-004 | Rate limit: from one IP hammer `GET /health` >100/15min in prod | 429 after threshold |
| ENV-005 | Apply `prisma/partial-unique-indexes.sql` manually and verify each index exists in Postgres (`\di` in psql) | 10 partial indexes + 1 CHECK constraint present |

---

## 1. Authentication (`/api/auth`)

### 1.1 Registration

| ID | Test | Expected |
|---|---|---|
| AUTH-001 | `POST /register` customer with all required fields + profilePicture file | 200 `{ success, requiresVerification: true, email }`, user row exists with `isEmailVerified=false`, OTP email arrives within 30s |
| AUTH-002 | `POST /register` supplier with `categoryId`, `governmentIds[]`, `jobTitles[]`, `profilePicture` | 200, user row created with supplier role, join-table row in `UserGovernment` |
| AUTH-003 | Register supplier missing `categoryId` | 400 "Category is required for supplier" |
| AUTH-004 | Register supplier with empty `jobTitles[]` | 400 "At least one job title is required" |
| AUTH-005 | Register supplier with empty `governmentIds[]` | 400 "At least one government/service area is required" |
| AUTH-006 | Register supplier with invalid (non-UUID) `categoryId` | 400 validator "Invalid category ID" |
| AUTH-007 | Register supplier with a UUID that doesn't exist in Categories | 400 "Invalid category" |
| AUTH-008 | Register supplier with one unknown government in the list | 400 "One or more governments are invalid" |
| AUTH-009 | Register missing `profilePicture` file | 400 "Profile picture is required" |
| AUTH-010 | Register with profilePicture >5MB | 400 "File too large" |
| AUTH-011 | Register with profilePicture as `.gif` or other disallowed mime | 400 "Invalid file type" |
| AUTH-012 | Register with duplicate email of a **verified** user | 409 "User already exists" |
| AUTH-013 | Register with duplicate email of an **unverified** user | 200 reuseUnverified path, new OTP email arrives |
| AUTH-014 | Register with duplicate phoneNumber | 409 "Phone number already registered" |
| AUTH-015 | Register missing `address` | 400 "Address is required" |
| AUTH-016 | Register with weak password (<8 chars) | 400 validator |

### 1.2 Email verification

| ID | Test | Expected |
|---|---|---|
| AUTH-020 | `POST /verify-email` with correct OTP | 200 success, user `isEmailVerified=true`, welcome email queued, notification created |
| AUTH-021 | Verify with wrong OTP | 400 "Invalid OTP", attempts counter in Redis incremented |
| AUTH-022 | Verify after 5 wrong attempts in 5 min | 429 "Too many OTP attempts" |
| AUTH-023 | Verify with expired OTP (wait >5 min) | 400 |
| AUTH-024 | `POST /resend-verification` for unverified user | 200, new OTP email |
| AUTH-025 | Resend more than 3 times in 1 hour | 429 "Too many resend attempts" |
| AUTH-026 | Resend for already-verified user | 400 "Email is already verified" |

### 1.3 Login

| ID | Test | Expected |
|---|---|---|
| AUTH-030 | `POST /login` with valid verified customer | 200, `{ accessToken, refreshToken, user, category?, governments }`. `user.governmentIds` is a flat `string[]`, no nested `governments` array on user. Redis key `refresh:<userId>:<sessionId>` set |
| AUTH-031 | Login with wrong password | 400 "Invalid credentials", attempts incremented |
| AUTH-032 | Login with non-existent email | 400 "Invalid credentials" |
| AUTH-033 | Login 5x with wrong password | Account locked 15 min, 429 "Account locked" |
| AUTH-034 | Login unverified email | 403 "Email not verified", new OTP sent |
| AUTH-035 | Login verified-but-incomplete-profile user | 403 "Account not verified" |
| AUTH-036 | Supplier login returns `category` (without `jobs` field) and `governments` array | category present, governments array populated |
| AUTH-037 | Customer login — `category` should be null/absent, `governments` empty | ok |

### 1.4 Refresh & logout

| ID | Test | Expected |
|---|---|---|
| AUTH-040 | `POST /refresh` with valid refreshToken | 200, new tokens, old refresh key deleted, new refresh key set |
| AUTH-041 | Refresh with tampered token | 401 "Invalid refresh token" |
| AUTH-042 | Refresh after logout | 401 |
| AUTH-043 | `POST /logout` with Bearer access token | 200, Redis refresh key deleted, access token blacklisted |
| AUTH-044 | Use the same access token after logout | 401 (blacklist check) |

### 1.5 Password reset

| ID | Test | Expected |
|---|---|---|
| AUTH-050 | `POST /forgot-password` with registered email | 200, OTP email sent |
| AUTH-051 | Forgot-password with unknown email | 200 (no user enumeration) |
| AUTH-052 | Forgot-password >3 times in 1 hour | 429 |
| AUTH-053 | `POST /verify-reset-otp` with valid OTP | 200, returns a `token` (hex) |
| AUTH-054 | Verify with wrong OTP — 5 attempts | 429 "Too many invalid attempts" |
| AUTH-055 | `POST /reset-password` with token + new password | 200, login with old password fails, new password works |
| AUTH-056 | Reuse same reset token after success | 400 "Invalid or expired reset token" |
| AUTH-057 | `PATCH /change-password` with wrong current password | 400 |
| AUTH-058 | Change password with same as current | 400 "must be different" |
| AUTH-059 | Change password — previous session invalidated | refresh token revoked, re-login required |

### 1.6 Role switching

| ID | Test | Expected |
|---|---|---|
| AUTH-060 | Customer → supplier with all required supplier fields | 200, new tokens, user.role=supplier, categoryId/governments populated |
| AUTH-061 | Customer → supplier missing categoryId | 400 |
| AUTH-062 | Supplier → customer | 200, works without supplier fields |
| AUTH-063 | Switch to same role | 400 "You already have this role" |
| AUTH-064 | Switch while having an active session | 400 (should be blocked — verify session-in-progress check) |

### 1.7 Biometric devices

| ID | Test | Expected |
|---|---|---|
| AUTH-070 | `POST /devices/register` with `type=faceid` | 200, `UserBiometric` row created |
| AUTH-071 | Register with `type=passcode` and `passcode=1234` | 200, passcodeHash stored |
| AUTH-072 | Register passcode without `passcode` in body | 400 "Passcode is required" |
| AUTH-073 | Register same deviceId twice | 400 "Device already registered" |
| AUTH-074 | `POST /devices/login` with registered faceid device | 200, returns tokens |
| AUTH-075 | Passcode login with wrong passcode | 403 "Invalid passcode" |
| AUTH-076 | Biometric login with unknown deviceId | 404 "Device not registered" |
| AUTH-077 | `DELETE /devices/:deviceId` | 200, row removed |

### 1.8 User CRUD

| ID | Test | Expected |
|---|---|---|
| AUTH-080 | `GET /auth/` admin lists all users | 200, array |
| AUTH-081 | `GET /auth/:id` with valid UUID | 200 |
| AUTH-082 | `GET /auth/:id` with non-UUID | 400 "Invalid user ID" |
| AUTH-083 | `PUT /auth/:id` updates firstName/lastName/address | 200, fields updated, non-allowed fields ignored |
| AUTH-084 | `DELETE /auth/:id` | 200, user row gone, cascade removes `UserBiometric`/`UserGovernment` |

---

## 2. Categories (`/api/categories`)

| ID | Test | Expected |
|---|---|---|
| CAT-001 | `GET /` public list | 200, only active by default |
| CAT-002 | `GET /:id` with valid UUID | 200 with workflows included |
| CAT-003 | `GET /:id` with non-UUID | 400 "Invalid UUID" |
| CAT-004 | `POST /` admin create with valid payload + image file | 201, normalizedName lowercased, `CATEGORY_CREATED` queue event published, customers receive "New Category" notification |
| CAT-005 | Create duplicate name (case-insensitive) | 409 "Category already exists" |
| CAT-006 | Create with empty jobs/workflows | 201 (both default to empty arrays) |
| CAT-007 | Create with duplicate workflow keys | 400 "Workflow keys must be unique within a category" |
| CAT-008 | Create without image file | 400 "Category image is required" |
| CAT-009 | `PUT /:id` non-admin | 403 |
| CAT-010 | Update with new name → renames normalizedName, no duplicate conflict | 200 |
| CAT-011 | Update renames to a name that collides with another category | 409 |
| CAT-012 | Update replaces workflows entirely | 200, old workflows removed, new ones persisted |
| CAT-013 | `DELETE /:id` | 200, `isActive=false`, `CATEGORY_DEACTIVATED` published |
| CAT-014 | Delete already inactive | 400 "already inactive" |

---

## 3. Governments (`/api/governments`)

| ID | Test | Expected |
|---|---|---|
| GOV-001 | `GET /` public active list | 200, active only, ordered by `order` |
| GOV-002 | `GET /active` | same as GET / |
| GOV-003 | `GET /:id` valid | 200 |
| GOV-004 | `POST /` admin create | 201, `GOVERNMENT_CREATED` published |
| GOV-005 | Create duplicate normalizedName | 409 |
| GOV-006 | `PUT /:id` update name with collision | 409 |
| GOV-007 | `DELETE /:id` deactivate | 200, `GOVERNMENT_DEACTIVATED` published |
| GOV-008 | `PATCH /:id/toggle` | toggles isActive, fires `ACTIVATED`/`DEACTIVATED` |

---

## 4. Orders (`/api/orders`)

### 4.1 Creation

| ID | Test | Expected |
|---|---|---|
| ORD-001 | Customer `POST /` daily order with required fields + `expectedDays=5` + `timeToStart` (future date) | 201, status=pending, supplier feed broadcast fires, customer notification |
| ORD-002 | Create contract order with `estimatedDuration=90` (no expectedDays) | 201 |
| ORD-003 | Contract order with `expectedDays` present | 400 "expectedDays is not allowed for contract orders" |
| ORD-004 | Daily order missing `expectedDays` | 400 |
| ORD-005 | Contract missing `estimatedDuration` | 400 |
| ORD-006 | Create with invalid `categoryId` (unknown UUID) | 400 "Invalid category" |
| ORD-007 | `jobTitle` not in category.jobs | 400 "Invalid job title for this category", response includes `availableJobTitles` |
| ORD-008 | `selectedWorkflow` not in category.workflows | 400, response includes `availableWorkflows` |
| ORD-009 | Create while having another `pending` order | 400 "You already have a pending order" |
| ORD-010 | Create while having an `in_progress` order | 400 "active job session in progress" |
| ORD-011 | Create while having a completed-but-unreviewed order | 403 `reviewRequired: true`, response includes the unreviewed order |
| ORD-012 | Create with 5 images + 3 file attachments | 201, `images[]` and `files[]` populated with `{url, publicId}` |
| ORD-013 | Create with 6 images | multer rejects (validate config) |
| ORD-014 | Customer creates on their own feed category — allowed since they're customer here | 201 |

### 4.2 Read / browse

| ID | Test | Expected |
|---|---|---|
| ORD-020 | `GET /my-orders?page=1&limit=20` | 200, paginated list |
| ORD-021 | `GET /timeline` merges orders and bundle bookings sorted by recency | 200 |
| ORD-022 | `GET /check-pending` when customer has a pending order | `hasPendingOrders:true`, `pendingOrder`, `status: pending` |
| ORD-023 | Check-pending when customer has unreviewed completed order | `reviewRequired:true`, supplier info populated |
| ORD-024 | Check-pending when customer has nothing | `hasPendingOrders:false` |
| ORD-025 | `GET /scheduled?role=customer&from=X&to=Y` | paginated scheduled orders, each enriched with `offer` |
| ORD-026 | `GET /scheduled?role=supplier` for supplier | only their scheduled orders |
| ORD-027 | Scheduled with invalid `from` date | 400 "Invalid 'from' date" |
| ORD-028 | `GET /supplier-feed` as S1 in category+government matching pending order | order appears, `ordersWithOffers` separated from `availableOrders` |
| ORD-029 | Supplier-feed while supplier has an active session | returns `type: "active_job"` with the active order |
| ORD-030 | Supplier-feed with governmentIds=[] | empty list, count:0 |
| ORD-031 | `GET /:id` as customer who owns order | 200 |
| ORD-032 | `GET /:id` as different customer | 403 |
| ORD-033 | `GET /:id` as supplier matching category+government, not the owner | 200 |
| ORD-034 | `GET /:id` as supplier in wrong category | 403 |

### 4.3 Update & cancel

| ID | Test | Expected |
|---|---|---|
| ORD-040 | `PATCH /:id/price` as owner while pending | 200, `requestedPrice` updated, socket broadcast |
| ORD-041 | Price update after scheduled/in_progress | 400 "Cannot update price now" |
| ORD-042 | Price update by non-owner | 403 |
| ORD-043 | `PATCH /:id/cancel` while pending | 200, pending offers rejected, customer notified |
| ORD-044 | Cancel while scheduled | 200, accepted offer rejected, supplier notified |
| ORD-045 | Cancel while in_progress | 200, active session cancelled, order + offer rejected |
| ORD-046 | Cancel already completed | 400 "Only pending/scheduled/in-progress orders can be cancelled" |
| ORD-047 | Cancel as non-owner | 403 |

### 4.4 Invariants

| ID | Test | Expected |
|---|---|---|
| ORD-INV-01 | Try to insert a second pending order directly via API (race) | Second request fails with unique-index violation (409) |
| ORD-INV-02 | After scheduled order expires (`scheduledAt ≤ now`), session scheduler promotes to in_progress + creates session within 1 minute | verified via DB + socket `session_auto_started` |

---

## 5. Offers (`/api/offers`)

### 5.1 Create

| ID | Test | Expected |
|---|---|---|
| OFF-001 | S1 `POST /` with valid daily order body `{ amount, expectedDays, timeToStart }` | 201 created=true, customer gets `NEW_OFFER` notification + socket `offer:new`, supplier gets `SUPPLIER_OFFER_CREATED` |
| OFF-002 | Contract order offer body `{ amount, estimatedDuration, timeToStart }` | 201 |
| OFF-003 | Daily offer missing `expectedDays` | 400 |
| OFF-004 | Contract offer missing `estimatedDuration` | 400 |
| OFF-005 | Offer on own order | 400 "cannot create an offer on your own order" |
| OFF-006 | Offer on already-accepted order | 400 "Cannot create offer for this order now" |
| OFF-007 | Same supplier posts second offer on same order → upsert path | 200 created=false (updated), only one pending offer row for `(supplierId, orderId)` |
| OFF-008 | Second supplier's concurrent offer | both succeed, each has their own row |
| OFF-009 | Offer timeToStart conflicts with supplier's existing accepted offer same day | 409 "Time conflict" |
| OFF-010 | Offer while supplier has an active session | 400 "active job session in progress" |
| OFF-011 | Offer while supplier has a completed-but-unreviewed job | 403 reviewRequired |
| OFF-012 | Amount ≤ 0 | 400 "Offer amount must be greater than 0" |

### 5.2 Accept / reject / withdraw / delete

| ID | Test | Expected |
|---|---|---|
| OFF-020 | Customer accepts offer with `timeToStart > now` | 200 `isScheduled:true`, order→scheduled, supplierId populated, other pending offers rejected, supplier's other pending offers rejected |
| OFF-021 | Customer accepts offer with `timeToStart <= now` | 200 `isScheduled:false`, order→in_progress, session created with workflow steps, `SESSION_CREATED` socket |
| OFF-022 | Accept a non-pending offer | 409 |
| OFF-023 | Accept as non-owner | 403 |
| OFF-024 | `POST /order/:orderId/accept-direct` as supplier | 201 (or 200), single accepted offer created at requestedPrice, no body required |
| OFF-025 | Direct-accept with empty body — works | 201 |
| OFF-026 | Direct-accept own order | 400 |
| OFF-027 | Customer `PUT /:id/reject` pending offer | 200, rejected, supplier gets `OFFER_REJECTED` |
| OFF-028 | Reject already-accepted offer | 400/409 |
| OFF-029 | Supplier `DELETE /:id` pending offer (withdraw) | 200, status=withdrawn, customer + supplier notified |
| OFF-030 | Supplier withdraws accepted offer while order is SCHEDULED | 200, order→pending, session not yet created so none to cancel |
| OFF-031 | Supplier withdraws accepted offer while order is IN_PROGRESS with active session | 200, session→cancelled, order→pending, customer notified |
| OFF-032 | Withdraw another supplier's offer | 403 |

### 5.3 Listing

| ID | Test | Expected |
|---|---|---|
| OFF-040 | `GET /supplier/pending?page=1` | paginated pending offers, `stats.hasActiveJob` boolean |
| OFF-041 | `GET /supplier/history` | accepted/completed/withdrawn offers |
| OFF-042 | `GET /order/:orderId` as customer (owner) | all offers on order with supplier info |
| OFF-043 | Same as supplier who posted an offer | only their offers |
| OFF-044 | As supplier who didn't post on this order | 403 |

### 5.4 Invariants

| ID | Test | Expected |
|---|---|---|
| OFF-INV-01 | Two concurrent accepts on same offer | one succeeds, other 409 |
| OFF-INV-02 | Supplier posts two concurrent pending offers on same order | one succeeds, other 409 (partial unique index) |

---

## 6. Sessions (`/api/sessions`)

| ID | Test | Expected |
|---|---|---|
| SES-001 | Indirect creation: accept offer → session row exists with workflowSteps hydrated from category | verified |
| SES-002 | `GET /active` as participant (customer) | 200, populated session (order/offer/customer/supplier) |
| SES-003 | `GET /active` while no active session | `active:false` |
| SES-004 | `GET /:id` as participant | 200 |
| SES-005 | `GET /:id` as non-participant | 403 |
| SES-006 | `GET /order/:orderId` | 200 |
| SES-007 | `GET /booking/:bookingId` for bundle session | 200 |
| SES-008 | `PATCH /:id/status` supplier advances to next workflow step | 200, `stepTimestamps[nextStatus]` set, socket `SESSION_STATUS_UPDATED` |
| SES-009 | Advance out of order (skip a step) | 400 (invalid transition) |
| SES-010 | Advance by customer | 403 "Only supplier can do this action" |
| SES-011 | Advance with nextStatus=completed | 400 "Use the complete endpoint" |
| SES-012 | `PATCH /:id/cancel` by customer | 200, session+order cancelled, accepted offer rejected, other pending offers rejected |
| SES-013 | Cancel by supplier | 200, session→cancelled, offer→withdrawn, order→pending |
| SES-014 | Cancel already-terminal session | 400 |
| SES-015 | `PATCH /:id/complete` by supplier at last step | 200, session+order+offer→completed, `REVIEW_REQUIRED` fired to both |
| SES-016 | Complete before last step | 400 "Session cannot be completed from its current step" |
| SES-017 | `PATCH /:id/confirm-payment` by supplier after completion | 200, paymentConfirmed=true |
| SES-018 | Confirm payment twice | 409 "Payment already confirmed" |
| SES-019 | Confirm payment before completion | 400 |
| SES-020 | Confirm payment by customer | 403 |
| SES-021 | `GET /resume` — supplier with completed unpaid session | `action: payment_confirmation` |
| SES-022 | Resume — customer with completed unreviewed session | `action: review` |
| SES-023 | Resume — supplier with completed paid but unreviewed | `action: review` |
| SES-024 | Resume — nothing pending | `action: none` |
| SES-INV-01 | Customer tries to start a second session (bundle booking or new accept) while one is active | blocked by `uniq_customer_single_active_session` |
| SES-INV-02 | Same for supplier | blocked by `uniq_supplier_single_active_session` |
| SES-INV-03 | Insert a JobSession with all parent IDs null | CHECK constraint fires |
| SES-INV-04 | Insert a JobSession with both `orderId` AND `bundleBookingId` set | CHECK constraint fires |

---

## 7. Chat (`/api/chat`)

| ID | Test | Expected |
|---|---|---|
| CHAT-001 | `POST /` participant sends message to active session | 201, `Message` row persisted, `message:new` socket to session room + both users |
| CHAT-002 | Send message to completed session | 403 "Chat is closed" |
| CHAT-003 | Send by non-participant | 403 |
| CHAT-004 | Send empty message | 400 |
| CHAT-005 | Send >5000 chars | 400 |
| CHAT-006 | `GET /session/:sessionId` as participant | 200 paginated (newest-first reversed to chronological) |
| CHAT-007 | `GET /session/:sessionId` as non-participant | 403 |
| CHAT-008 | `PATCH /session/:sessionId/read` marks all receiver's unread as read | 200, `message:read` socket fires with new unreadCount |

---

## 8. Calls (`/api/calls`)

| ID | Test | Expected |
|---|---|---|
| CALL-001 | `GET /ice-config` | 200 with STUN (+ TURN if env vars set) |
| CALL-002 | `POST /start` with valid session + audio type | 201, `CallSession` row status=ringing, `call:incoming` to receiver, `call:ringing` to caller, notification fired |
| CALL-003 | Start call while session has active call | 409 "already an active call", response carries existing `callId` |
| CALL-004 | Start call on terminal session | 403 "Session is not active" |
| CALL-005 | Start call by non-participant | 403 |
| CALL-006 | `POST /:id/accept` by receiver | 200, status=accepted, `answeredAt` set |
| CALL-007 | Accept by caller | 403 |
| CALL-008 | Accept already-ended call | 400 |
| CALL-009 | `POST /:id/decline` by receiver | 200, `call:declined` + notification |
| CALL-010 | `POST /:id/end` by caller | 200, endReason=caller_ended |
| CALL-011 | End by receiver | endReason=receiver_ended |
| CALL-012 | End already-ended call | 400 |
| CALL-013 | `POST /:id/missed` after ring timeout | 200, status=missed, missed-call notification |
| CALL-014 | `GET /session/:sessionId/history` as participant | array of call sessions with caller/receiver populated |
| CALL-015 | Socket WebRTC: `call:start` → receiver gets `call:incoming` | ok |
| CALL-016 | Socket `webrtc:offer` routed to opposite party | ok |
| CALL-017 | Socket `webrtc:answer` routed back | ok |
| CALL-018 | Socket `webrtc:ice-candidate` relayed | ok |
| CALL-INV-01 | Concurrent call start on same session | one succeeds, other 409 (partial unique index `uniq_active_call_per_session`) |

---

## 9. Notifications (`/api/notifications`)

| ID | Test | Expected |
|---|---|---|
| NOT-001 | Upstream event (e.g. offer accepted) → `Notification` row persisted + `new_notification` socket | ok |
| NOT-002 | `GET /?page=1&limit=20` | paginated by `createdAt desc`, includes `total`, `unreadCount` |
| NOT-003 | `PATCH /:id/read` as owner | 200, isRead=true, `NOTIFICATION_READ` socket with new unreadCount |
| NOT-004 | Mark-read on already-read | 200, idempotent |
| NOT-005 | Mark-read by non-owner | 403 |
| NOT-006 | `PATCH /read-all` | 200, all flip to read, unreadCount=0, socket fires |
| NOT-007 | `POST /` internal | 403 for non-self target |

---

## 10. Reviews (`/api/reviews`)

| ID | Test | Expected |
|---|---|---|
| REV-001 | Customer `POST /` after session completion with orderId | 201, review persisted, target user's `averageRating`/`totalReviews` recomputed, order.customerReviewed=true, `NEW_REVIEW` notification to supplier |
| REV-002 | Supplier review on same order | 201, order.supplierReviewed=true |
| REV-003 | Both reviewed → `REVIEWS_COMPLETE` fired to both | ok |
| REV-004 | Review before order completion | 400 "Reviews can only be submitted after completion" |
| REV-005 | Review same order twice by same reviewer | 400 "You have already submitted a review" (partial unique index) |
| REV-006 | Review by someone who isn't customer or supplier on the session | 403 |
| REV-007 | Customer-role review of supplier but role field says "supplier" | 403 |
| REV-008 | Self-review | 400 "You cannot review yourself" |
| REV-009 | Review with rating=0 or rating=6 | 400 |
| REV-010 | Review bundle booking completion (pass `bundleBookingId`) | 201, booking.customerReviewed/supplierReviewed flipped |
| REV-011 | `GET /:id` | 200 with reviewer + target populated |
| REV-012 | `GET /order/:orderId` | array |
| REV-013 | `GET /user/:userId?page=1` | paginated reviews received |

---

## 11. Availability (`/api/availability`)

| ID | Test | Expected |
|---|---|---|
| AVL-001 | `GET /supplier/:supplierId/calendar?month=2026-04` | 200, days map with `available`/`has_bookings`, ordersByDate populated |
| AVL-002 | Calendar for non-supplier user | 404 |
| AVL-003 | `GET /supplier/:supplierId/slots?date=2026-04-15` | 200, bookedTimes ordered by start, includes both bundle bookings and ad-hoc orders |
| AVL-004 | Slots for date with no bookings | empty array |
| AVL-005 | New supplier: auto-creates default 7-day weekly schedule on first read | 7 `WeeklyScheduleItem` rows, 5 working days 09:00-17:00, weekends off |

---

## 12. Bundles (`/api/bundles`)

| ID | Test | Expected |
|---|---|---|
| BUN-001 | `GET /` public feed, filter by categoryId | only matching active bundles |
| BUN-002 | Feed filter by governmentId | uses join-table `BundleGovernment` |
| BUN-003 | `GET /me` as supplier | own bundles |
| BUN-004 | `GET /me` as customer | 403 |
| BUN-005 | `GET /:id` | 200 with governments populated |
| BUN-006 | `POST /` supplier create with valid fields + durationMinutes in allowed set (15/30/45/60/90/120/180/240) | 201 |
| BUN-007 | Create with durationMinutes=77 | 400 (not in allowed set) |
| BUN-008 | Create with oldPrice < price | 400 "oldPrice must be >= price" |
| BUN-009 | Create with `selectedWorkflow` not in category | 400 "Invalid workflow for this category" |
| BUN-010 | Create with empty governmentIds (supplier has none) | 400 "At least one government is required" |
| BUN-011 | Create as customer | 403 "Only suppliers can manage bundles" |
| BUN-012 | `PUT /:id` owner updates title, price, etc. | 200 |
| BUN-013 | Update non-owner | 403/404 |
| BUN-014 | Update governmentIds replaces join-table entries | old rows deleted, new rows created |
| BUN-015 | `PATCH /:id/status` toggles isActive | ok |
| BUN-016 | `DELETE /:id` | 200, bundle and BundleGovernment rows gone |

---

## 13. Bundle bookings (`/api/bundle-bookings`)

### 13.1 Creation

| ID | Test | Expected |
|---|---|---|
| BB-001 | Customer `POST /` with valid bundleId + governmentId + address + bookedDate + slotStart/slotEnd + scheduledAt | 201, status=pending_supplier_approval, supplier socket + `BUNDLE_BOOKING_CREATED` notification |
| BB-002 | Book own bundle (supplier self-booking) | 400 "You cannot book your own bundle" |
| BB-003 | Book inactive bundle | 404 |
| BB-004 | Slot overlaps supplier's existing booking same day | 409 "slot is no longer available" |
| BB-005 | Slot overlaps supplier's scheduled ad-hoc order same day | 409 |
| BB-006 | Slot overlaps customer's other booking same day | 409 |
| BB-007 | slotStart >= slotEnd | 400 |

### 13.2 Negotiation flow

| ID | Test | Expected |
|---|---|---|
| BB-020 | Supplier `PATCH /:id/accept` while pending_supplier_approval | 200, status=accepted. If `scheduledAt <= now`, session auto-created and status moves to in_progress |
| BB-021 | Supplier `PATCH /:id/reject` with reason | 200, status=rejected |
| BB-022 | Supplier `PATCH /:id/propose-time` | 200, status=pending_customer_approval, proposed fields populated |
| BB-023 | Customer `PATCH /:id/approve-proposed-time` | 200, status=accepted with proposed fields committed |
| BB-024 | Customer `PATCH /:id/reject-proposed-time` | 200, back to pending_supplier_approval |
| BB-025 | Supplier proposes time after already accepted | 400 "not in a negotiation state" |
| BB-026 | Customer tries to propose on a pending_supplier booking | 400 "not your turn" |

### 13.3 Session lifecycle

| ID | Test | Expected |
|---|---|---|
| BB-040 | Supplier `PATCH /:id/start` after acceptance when scheduledAt is now | 200, status=in_progress |
| BB-041 | Start after session auto-created — blocked | 400 "managed by session workflow" |
| BB-042 | Supplier `PATCH /:id/mark-done` | 200, status=done, notification |
| BB-043 | Customer `PATCH /:id/complete` from done | 200, status=completed, paymentConfirmed=true |
| BB-044 | `PATCH /:id/cancel` by customer while accepted | 200, status=cancelled, cancelledBy=customer |
| BB-045 | Cancel already-completed | 400 |

### 13.4 Session scheduler worker

| ID | Test | Expected |
|---|---|---|
| BB-060 | Create booking with scheduledAt=now+2min, accept it | after 2 min, `session-scheduler` auto-creates session, status→in_progress, `session_auto_started` socket to both |
| BB-061 | Same for scheduled ad-hoc orders (ORD-INV-02) | ok |

---

## 14. Cross-cutting: events, sockets, workers

| ID | Test | Expected |
|---|---|---|
| WRK-001 | Start server, check all 5 workers logged ready | USER_REGISTERED, notifications, email_jobs, CATEGORY_CREATED, session-scheduler |
| WRK-002 | Kill RabbitMQ mid-run | publishToQueue throws, clients see 500; bring it back, retries succeed |
| WRK-003 | SMTP warmup on startup logs "✅ SMTP transporter verified" | ok |
| WRK-004 | First register after cold start → email arrives on first attempt (with retry if SMTP flakes) | ok |
| SOCK-001 | Connect socket with valid JWT in `auth.token` | connected, joins `user:<id>` room |
| SOCK-002 | Connect without token | disconnected |
| SOCK-003 | Supplier `join_supplier_order_rooms` with own category+governmentIds | joined all relevant rooms |
| SOCK-004 | `join_session_room` for session you're not in | joined (no enforcement here — consider if needed) |
| SOCK-005 | New order in your category+government → `order:new` on supplier feed room | ok |
| SOCK-006 | Order cancelled → `order:cancelled` broadcast | ok |

---

## 15. End-to-end happy path (smoke test)

| ID | Scenario |
|---|---|
| E2E-01 | Register C1 → verify email → complete profile → login |
| E2E-02 | Register S1 supplier → verify → login; verify category + governments present in login response |
| E2E-03 | C1 creates daily order in S1's category+government with `timeToStart=now+1h` |
| E2E-04 | S1 sees order in supplier feed |
| E2E-05 | S1 creates offer with `expectedDays=3` and their own `timeToStart` matching requested day |
| E2E-06 | C1 sees offer via socket and `NEW_OFFER` notification |
| E2E-07 | C1 accepts offer → order goes to `scheduled` since timeToStart > now |
| E2E-08 | Wait until scheduler picks it up → order → in_progress, session auto-created, `session_auto_started` event |
| E2E-09 | C1 and S1 exchange chat messages in the session room |
| E2E-10 | S1 advances workflow steps one by one → customer sees `SESSION_STATUS_UPDATED` |
| E2E-11 | S1 starts a video call → C1 receives `call:incoming`, accepts, exchanges SDP, hangs up |
| E2E-12 | S1 completes session → order + offer → completed, both get `REVIEW_REQUIRED` |
| E2E-13 | C1 reviews S1 (rating 5); S1's averageRating recomputed |
| E2E-14 | S1 confirms payment |
| E2E-15 | S1 reviews C1 → `REVIEWS_COMPLETE` fires to both |
| E2E-16 | Resume endpoint returns `action: none` for both |

| ID | Scenario (bundle) |
|---|---|
| E2E-20 | S1 creates a 60-min bundle in their category/government |
| E2E-21 | C1 books the bundle for tomorrow 10:00 |
| E2E-22 | S1 accepts |
| E2E-23 | Scheduler promotes it when time comes → session auto-created |
| E2E-24 | S1 walks workflow steps → mark-done → C1 completes → both review |

---

## 16. Security & abuse

| ID | Test | Expected |
|---|---|---|
| SEC-001 | Call any protected endpoint without Bearer token | 401 |
| SEC-002 | Pass a JWT signed with wrong secret | 401 |
| SEC-003 | Pass expired access token | 401 |
| SEC-004 | Modify a field in the JWT payload and replay | 401 (signature mismatch) |
| SEC-005 | Role-gated endpoint (admin category create) hit as customer | 403 |
| SEC-006 | SQL-injection string in free-text fields (`address`, `description`) | persisted as-is (Prisma parameterizes), no error |
| SEC-007 | XSS payload in review comment | stored raw, clients must escape on display |
| SEC-008 | IDOR: customer C1 tries to read C2's order by id | 403 |
| SEC-009 | IDOR: S1 tries to withdraw S2's offer | 403 |
| SEC-010 | Reset-password token reuse | 400 |
| SEC-011 | Refresh token replay after logout | 401 |
| SEC-012 | Brute-force login 5x wrong → account lock 15 min | 429 |
| SEC-013 | Brute-force OTP 5x wrong → 429 | 429 |
| SEC-014 | Large file upload (>5MB) | 400 "File too large" |

---

## 17. Database invariants (verify in psql)

| ID | Query | Expected |
|---|---|---|
| DB-001 | `SELECT indexname FROM pg_indexes WHERE tablename='Order' AND indexname='uniq_customer_single_pending_order';` | 1 row |
| DB-002 | Same for `uniq_supplier_pending_offer_per_order`, `uniq_order_single_accepted_offer` | all present |
| DB-003 | `uniq_active_orderId`, `uniq_active_offerId`, `uniq_active_bundleBookingId` on JobSession | all present |
| DB-004 | `uniq_customer_single_active_session`, `uniq_supplier_single_active_session` | present |
| DB-005 | `uniq_active_call_per_session` | present |
| DB-006 | CHECK constraint `jobsession_single_parent` | present |
| DB-007 | `SELECT COUNT(*) FROM "JobSession" WHERE "orderId" IS NULL AND "bundleBookingId" IS NULL;` | 0 |
| DB-008 | For any completed session: corresponding order/booking also completed | no mismatches |
| DB-009 | Money columns typed as `numeric(12,2)` | ok |
| DB-010 | All FK columns non-orphan: `SELECT COUNT(*) FROM "Offer" o LEFT JOIN "Order" ord ON ord.id=o."orderId" WHERE ord.id IS NULL;` | 0 |

---

## 18. Error handler & shape

| ID | Test | Expected |
|---|---|---|
| ERR-001 | Trigger AppError — response shape `{ message, error? }` | ok |
| ERR-002 | In dev mode: 500 returns stack | ok |
| ERR-003 | In prod mode: no stack | ok |
| ERR-004 | Validation errors: `{ success:false, message:"Validation failed", errors:[{path,msg,...}] }` | ok |
| ERR-005 | Non-UUID id in param | validator catches before service |

---

## Quick progress tracker

- [ ] 0. Env ________
- [ ] 1. Auth ________
- [ ] 2. Categories ________
- [ ] 3. Governments ________
- [ ] 4. Orders ________
- [ ] 5. Offers ________
- [ ] 6. Sessions ________
- [ ] 7. Chat ________
- [ ] 8. Calls ________
- [ ] 9. Notifications ________
- [ ] 10. Reviews ________
- [ ] 11. Availability ________
- [ ] 12. Bundles ________
- [ ] 13. BundleBookings ________
- [ ] 14. Workers/sockets ________
- [ ] 15. E2E smoke ________
- [ ] 16. Security ________
- [ ] 17. DB invariants ________
- [ ] 18. Error handler ________
