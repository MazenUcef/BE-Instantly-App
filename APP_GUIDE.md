# BE-Instantly-App — Application Guide

Last updated: 2026-04-14

This is the single source of truth for **what** this backend does, **how** its pieces fit together, and **where** to look when you need to change something. It assumes you can read the code for *how exactly* — the goal here is to keep you from having to re-derive the domain every time you come back to the repo.

---

## 1. What this system is

A **service marketplace backend**. Customers post jobs (called **orders**) for services in a specific **category** (plumbing, electrical, cleaning, etc.) and **government** (geographic coverage area — "governorate" in Egyptian usage). Suppliers in that category/government see those orders in their feed and either:

- **Bid** on them by creating an **offer** (price + schedule), which the customer accepts, or
- **Accept directly** at the customer's requested price.

Either path produces a **JobSession** — the active working record, which hosts chat, calls, the workflow step tracker, and (on completion) reviews.

In parallel, suppliers can publish **bundles** — prepackaged services with a fixed price and a fixed duration. Customers book a bundle into a specific time slot, producing a **BundleBooking**, which eventually hydrates into a **JobSession** when the supplier starts the job.

That is the whole business. Everything else is plumbing.

---

## 2. Top-level architecture

### Runtime
- **Node.js / Express / TypeScript** HTTP API, port `6000` by default.
- **Socket.io** mounted on the same HTTP server for realtime.
- **PostgreSQL** via **Prisma** (migrated from MongoDB/Mongoose).
- **Redis** for session/refresh-token tracking and ephemeral state.
- **RabbitMQ** for async work — four queues:
  - `USER_REGISTERED` — post-signup side-effects (welcome email, etc.)
  - `notifications` — fan-out of in-app notifications
  - `email_jobs` — transactional email
  - `category_jobs` — category/taxonomy change side-effects
- **Cloudinary** for image/file storage (via **Multer**).
- **Twilio** for voice/ICE configuration used by WebRTC calling.
- **JWT** access (15 min) + refresh (7 days) tokens with **Redis**-backed session tracking.

### Entry points
- `src/server.ts` — starts workers + Redis + server.
- `src/app.ts` — Express bootstrap: Helmet, CORS, rate limiting (100 req / 15 min in prod, 1000 in dev), Socket.io init, route registration, DB connect, error handler.

### Module layout

Every feature lives in `src/modules/<feature>/` and follows the same layered shape:

```
modules/<feature>/
├── controllers/    — thin HTTP handlers
├── services/       — business logic
├── repositories/   — Prisma data access (static methods, accept optional `tx` transaction client)
├── routes/         — Express route definitions with middleware chains
├── validators/     — express-validator rule arrays
└── helpers/        — module-specific utilities (some modules only)
```

Controllers never touch Prisma directly — they must go through the service → repository chain. Services never import models directly.

Module list: `auth`, `category`, `government`, `order`, `offer`, `session`, `chat`, `call`, `notification`, `review`, `availability`, `bundle`, `bundleBooking`.

### Workers

Background RabbitMQ consumers started from `src/server.ts`:
- `user.worker.ts` — handles `USER_REGISTERED` events (welcome email, default availability seed).
- `notification.worker.ts` — processes notifications queue, persists + sockets.
- `email.worker.ts` — processes email jobs.
- `category.worker.ts` — category taxonomy side-effects.
- `session-scheduler.worker.ts` — cron-like scheduler that promotes due scheduled orders / bundle bookings into live sessions.

### Shared

`src/shared/` holds cross-module concerns:

- `config/prisma.ts` — PrismaClient singleton.
- `config/database.ts` — `connectDB()` called from `app.ts`.
- `config/redis.ts` — ioredis client.
- `config/rabbitmq.ts` — connection + `publishToQueue()`.
- `config/socket.ts` — Socket.io init + room helpers + event names.
- `config/cloudinary.ts` + `config/multer.ts` — file uploads.
- `middlewares/authenticate.ts` — JWT verification + role guard (`authorize`).
- `middlewares/errorHandler.ts` — centralized error mapping (`AppError`).
- `middlewares/validate.ts` — express-validator runner.
- `constants/*.ts` — per-domain enums (order statuses, roles, session states, etc.).
- `utils/` — OTP, password hashing, email dispatch, token helpers, time-conflict detection.

---

## 3. Data model

All entities have `id: uuid`, `createdAt`, `updatedAt`. Money fields use `Decimal(12,2)`.

### User (auth)

The root actor. Three roles: `customer`, `supplier`, `admin`. A single user can have both customer and supplier semantics — role is stored but the app supports role switching (see `switch-role`).

Key fields:
- `email`, `phoneNumber` — both unique.
- `role` — `customer | supplier | admin`.
- `categoryId` — suppliers only: their trade.
- `governments[]` (join table `UserGovernment`) — suppliers only: their coverage areas.
- `jobTitles[]` — free-form labels (e.g. "Licensed electrician").
- `profilePicture`, `address`.
- `isEmailVerified`, `isPhoneVerified`, `isProfileComplete` — onboarding flags.
- `averageRating`, `totalReviews` — denormalized and maintained by the review service.
- `biometrics[]` (separate table `UserBiometric`) — per-device FaceID/fingerprint/passcode hashes for quick login.

### Category + CategoryWorkflow

Categories are trades. Each category has:
- `name`, `normalizedName`, `description`, `image`, `isActive`.
- `jobs[]` — common job titles within the trade.
- `workflows[]` — **critical**: a category defines multiple named **workflows**, each a string of ordered **steps**. When an order/booking starts a session, the customer's `selectedWorkflow` is looked up here, and its `steps[]` become the session's `workflowSteps[]`. The session then walks those steps one by one.

### Government

Geographic area ("governorate"). Has `name`, `nameAr`, `country`, `order`, `isActive`. Join-table related to users (supplier coverage) and bundles.

### Order

Customer job request.

- `customerId`, `customerName` (denormalized).
- `supplierId` — null until an offer is accepted or direct-accept occurs.
- `categoryId`, `governmentId`.
- `jobTitle`, `description`, `address`, `images[]` (Json), `files[]` (Json).
- `requestedPrice` — what the customer asks.
- `finalPrice` — what the order actually closes at (set when an offer is accepted or on direct-accept).
- `orderType` — `daily` or `contract` (see §4.2).
- `selectedWorkflow` — name of the category workflow to run.
- `expectedDays` — daily orders: how many days of work.
- `estimatedDuration` — contract orders: minutes.
- `timeToStart`, `scheduledAt` — see §4.2.
- `status` — `pending → scheduled → in_progress → completed | cancelled`.
- `customerReviewed`, `supplierReviewed` — set once each side has left a review.

**Invariant:** a customer can have at most one `pending` order at a time. Enforced by a partial unique index (see `prisma/partial-unique-indexes.sql`).

### Offer

Supplier bid against an order.

- `orderId`, `supplierId`, `amount`.
- `estimatedDuration`, `expectedDays`, `timeToStart` — supplier's proposed schedule (see §4.3).
- `status` — `pending | accepted | rejected | expired | withdrawn | completed`.
- `acceptedAt`, `rejectedAt`, `withdrawnAt`, `completedAt`, `expiresAt`.

**Invariants:**
- One `pending` offer per `(orderId, supplierId)`.
- One `accepted` offer per `orderId`.

### JobSession

The "job is happening" record. Everything post-acceptance attaches here.

- Parent references (**exactly one parent group must be non-null**):
  - `orderId` + `offerId` (ad-hoc flow), OR
  - `bundleBookingId` (bundle flow).
  - Enforced by CHECK constraint `jobsession_single_parent`.
- `customerId`, `supplierId`.
- `workflowSteps[]` — ordered step names copied from the selected category workflow.
- `stepTimestamps` — Json map `{ stepName: Date }` recording when each step was marked complete.
- `status` — `started | completed | cancelled`.
- `paymentConfirmed`, `paymentConfirmedAt` — set after the customer confirms they've paid (post-session-completion gate).
- `startedAt`, `completedAt`, `cancelledAt`, `cancelledBy`, `cancellationReason`.

**Invariants:**
- At most one non-terminal session per `orderId`, `offerId`, or `bundleBookingId`.
- At most one non-terminal session per `customerId` and per `supplierId` — enforced so a user cannot be in two live jobs simultaneously.

### Message (chat)

Per-session chat message.
- `sessionId`, `senderId`, `receiverId`, `message`, `read`, `readAt`, `deliveredAt`.
- Chat is blocked once session is `completed` or `cancelled`.

### CallSession

WebRTC call log (the actual signaling rides Socket.io — this table records the call, not the stream).
- `sessionId`, `callerId`, `receiverId`, `type` (`audio | video`).
- `status` — `initiated | ringing | accepted | declined | missed | ended | failed`.
- `startedAt`, `answeredAt`, `endedAt`, `endReason`.
- **Invariant:** one active call per session at a time (`initiated`/`ringing`/`accepted`).

### Notification

Per-user in-app notification.
- `userId`, `type` (string tag — see `NOTIFICATION_TYPES`), `title`, `message`, `data: Json`, `isRead`, `readAt`.

### Review

- `reviewerId`, `targetUserId`, `orderId`, `sessionId?`, `rating` (1–5), `comment`.
- **Invariant:** `(reviewerId, orderId)` unique — one review per order per direction.
- On create, the service recomputes the target user's `averageRating` and `totalReviews`.

### SupplierAvailability + WeeklyScheduleItem + BlockedDate

- Per supplier, a timezone and an array of 7 weekly day records (`dayOfWeek` 0–6, working flag, start/end, slot duration, optional break).
- `BlockedDate[]` — one-off blackouts (full day or time range).
- Used by both ad-hoc offer scheduling and bundle booking slot generation.

### Bundle + BundleGovernment

Supplier-authored service package.
- `supplierId`, `categoryId`, `governments[]` (join table).
- `title`, `subtitle`, `description`, `image`, `tags[]`, `includes[]`.
- `price`, `oldPrice` (for strikethrough display).
- `durationMinutes` — one of 15, 30, 45, 60, 90, 120, 180, 240.
- `selectedWorkflow` — which category workflow plays when the bundle is executed.
- `isActive`.

### BundleBooking

- Parent: `bundleId`. Actors: `supplierId`, `customerId`. Taxonomy: `categoryId`, `governmentId`.
- `bookedDate` (YYYY-MM-DD), `slotStart`/`slotEnd` (HH:mm), `scheduledAt` (combined DateTime).
- `address`, `notes`, `finalPrice`.
- `status` state machine:
  ```
  pending_supplier_approval ─┬─► accepted ─► in_progress ─► done ─► completed
                             ├─► rejected
                             ├─► pending_customer_approval (supplier proposed a new slot)
                             └─► cancelled
  pending_customer_approval ──► accepted | pending_supplier_approval | cancelled
  accepted / in_progress / done ─► cancelled (always allowed)
  ```
- `proposedBookedDate` / `proposedSlotStart` / `proposedSlotEnd` / `proposedScheduledAt` — holds the supplier's counter-proposal when they bounce the customer into `pending_customer_approval`.
- `customerReviewed`, `supplierReviewed` — mirror of the Order flags.

---

## 4. Flows

### 4.1 Authentication

1. `POST /api/auth/register` — creates user, sends email OTP.
2. `POST /api/auth/verify-email` — consumes OTP, flips `isEmailVerified`.
3. `POST /api/auth/complete-profile` — PATCH-style, sets `categoryId`, `governmentIds`, `jobTitles`, `profilePicture`, marks `isProfileComplete`.
4. `POST /api/auth/login` — returns access+refresh tokens.
5. `POST /api/auth/refresh` — rotates tokens (refresh token stored in Redis).
6. `POST /api/auth/logout` — invalidates refresh token in Redis.
7. Biometric track:
   - `POST /api/auth/devices/register` — save `{deviceId, type, passcodeHash}` under the user.
   - `POST /api/auth/devices/login` — exchange deviceId + passcode/biometric payload for tokens.
   - `DELETE /api/auth/devices/:deviceId` — remove a device.
8. Password reset: `forgot-password` → email OTP → `verify-reset-otp` → `reset-password`.
9. Role switching: `POST /api/auth/switch-role` — customer ⇄ supplier (the user row stores one role; switching updates it and, if becoming supplier for the first time, requires profile completion).

### 4.2 Orders

**Create** — `POST /api/orders`:
- Validates presence of category, government, workflow, schedule fields by `orderType`.
- Denies if the customer already has an active (`pending`/`scheduled`/`in_progress`) order.
- Uploads images/files to Cloudinary via Multer.
- Persists as `pending`.
- Publishes a socket broadcast to suppliers in `room(category, government)` so the supplier feed updates live.
- Fires `NEW_ORDER`-type notifications.

**Order types:**
- **Daily** — long-running work (days). Customer provides `timeToStart` (a date) and `expectedDays`. The daily window is standardized to start at 09:00 and last 8 hours (`DAILY_START_HOUR=9`, `DAILY_DURATION_MINUTES=480` in `offer.service.ts`).
- **Contract** — short, discrete work. Customer provides `timeToStart` and `estimatedDuration` (minutes, e.g. "this'll take 90 minutes").

**Feed** — `GET /api/orders/supplier-feed`: returns `pending` orders in the caller's `categoryId` that overlap any of their `governmentIds`, excluding their own orders.

**Lifecycle transitions:**
- `pending → scheduled` — set when an offer with a future `timeToStart` is accepted (direct or via the offer flow). `scheduledAt`, `estimatedDuration`, `finalPrice`, and `supplierId` get populated. A scheduler worker later promotes this to `in_progress` + creates the session.
- `pending → in_progress` — set when the offer is accepted *now* (current `timeToStart`).
- `in_progress → completed` — set when the session walks its last workflow step.
- `any → cancelled` — set by the order, offer, or session cancel paths; propagates downward.

**Cancel paths:**
- `PATCH /api/orders/:id/cancel` — customer cancels (only if in an active status).
- Session cancel propagates back: if a session is cancelled before `completed`, the order is reset to `pending` via `OrderRepository.resetToPending` (supplier, finalPrice, scheduledAt, estimatedDuration wiped) so it can re-enter the feed. Exceptions: the caller may choose to fully cancel instead.

**Endpoints summary:**
- `POST /api/orders`
- `GET /api/orders/my-orders`, `GET /api/orders/timeline`, `GET /api/orders/check-pending`
- `GET /api/orders/scheduled`, `GET /api/orders/supplier-feed`, `GET /api/orders/:id`
- `PATCH /api/orders/:id/price`, `PATCH /api/orders/:id/cancel`

### 4.3 Offers

**Create / update** — `POST /api/offers`:
- Payload shape depends on the parent order's type:
  - **Daily order:** `{ amount, expectedDays, timeToStart }`. The service normalizes start time to the daily window and fixes `estimatedDuration` to 480 minutes.
  - **Contract order:** `{ amount, estimatedDuration, timeToStart }`.
- Enforces: no duplicate `pending` offer per `(order, supplier)` — if one exists, it's *updated*, not inserted (this is why the validator doesn't fail on "already exists").
- Refuses if the supplier has an active session, a completed-but-unreviewed previous job, or a time conflict with their own scheduled offers/bookings.
- On success, emits `SUPPLIER_OFFER_CREATED`/`SUPPLIER_OFFER_UPDATED` on the supplier's own user room, and notifies the customer with `NEW_OFFER` / `OFFER_UPDATED`.

**Accept** — `POST /api/offers/:id/accept` (customer-only, on the order):
- Transactional (`prisma.$transaction`):
  1. Validate the offer is `pending` and the caller owns the order.
  2. Flip the offer to `accepted`.
  3. Reject all other `pending` offers on the same order.
  4. Reject all other `pending` offers from the same supplier (they're now committed).
  5. Promote the order: `scheduled` if `timeToStart > now`, otherwise `in_progress`.
  6. If `in_progress`, create the `JobSession` with workflow steps hydrated from the category.
  7. Fire notifications and socket events.

**Direct accept** — `POST /api/offers/order/:orderId/accept-direct`:
- Supplier takes the order at `requestedPrice` with no negotiation. Skips the offer-body fields entirely — schedule comes straight off the order (`order.timeToStart`, `order.estimatedDuration`, `order.expectedDays`). Internally this still creates an `Offer` row (immediately `accepted`) to preserve the accepted-offer-per-order invariant and give the session an `offerId`.

**Reject / withdraw / delete:**
- Customer can **reject** a pending offer — `POST /api/offers/:id/reject`.
- Supplier can **withdraw** their own pending offer — `POST /api/offers/:id/withdraw`.
- Supplier can **withdraw** an already-accepted offer — resets the order back to `pending`, wipes `supplierId`/`finalPrice`/`scheduledAt`.
- Supplier can **delete** a pending offer — `DELETE /api/offers/:id` (distinct from withdraw: for cleanup of stale rows).

**Endpoints summary:**
- `POST /api/offers`, `PUT /api/offers/:id/accept`, `PUT /api/offers/:id/reject`
- `POST /api/offers/order/:orderId/accept-direct`, `DELETE /api/offers/:id`
- `GET /api/offers/supplier/pending`, `GET /api/offers/supplier/history`, `GET /api/offers/order/:orderId`

### 4.4 Sessions

Created indirectly — never via a "create session" endpoint. Entry points:
1. **Offer acceptance** (ad-hoc): offer service calls `SessionRepository.createSession` with `{ orderId, offerId, customerId, supplierId, workflowSteps }`.
2. **Bundle booking promotion** (bundle): `session-scheduler.worker.ts` promotes `accepted` bookings with `scheduledAt <= now` into `in_progress` and creates a session with `{ bundleBookingId, customerId, supplierId, workflowSteps }`.

**Session lifecycle** is driven by workflow steps:
- `workflowSteps[]` is immutable; `stepTimestamps` is a Json map written as each step is advanced.
- `PATCH /api/sessions/:id/advance` — records a timestamp for the next step. When the last step is completed:
  - Session flips to `completed`, `completedAt` set.
  - Order (or bundle booking) flips to `completed`.
  - `REVIEW_REQUIRED` notification fires for both sides.
  - Payment confirmation gate opens.
- `PATCH /api/sessions/:id/cancel` — marks the session `cancelled`, propagates to order/booking (reset to pending where applicable, or cancel outright).
- `PATCH /api/sessions/:id/confirm-payment` — customer confirms they've paid out-of-band. Required before the supplier can pick up new work (the offer-creation path checks `supplierReviewed === false && status === completed` as a block).

**Read endpoints:**
- `GET /api/sessions/active` — current non-terminal session (either side).
- `GET /api/sessions/:id`
- `GET /api/sessions/order/:orderId`, `GET /api/sessions/offer/:offerId`, `GET /api/sessions/booking/:bookingId`
- `GET /api/sessions/history` — completed/cancelled sessions for the caller.

### 4.5 Chat

- `POST /api/chat` — send a message into a session. Denied if session is terminal (`CHAT_SESSION_BLOCKED_STATUSES`).
- `GET /api/chat/session/:sessionId` — paginated history (default 50/page, newest first).
- `PATCH /api/chat/session/:sessionId/read` — mark all unread messages where the caller is `receiverId` as `read`.
- Live updates ride Socket.io:
  - `message:new` → emitted into `room(session)` and `room(user)` of the receiver.
  - `message:read` → emitted into the same rooms.
  - `chat:sync` → client pull.

### 4.6 Calls

WebRTC signaling is carried over Socket.io; the REST API tracks **CallSession** rows for audit and state.

- `GET /api/calls/ice-config` — returns Twilio STUN/TURN creds.
- `POST /api/calls/start` — create a `CallSession` row with `status=initiated`, emit `call:incoming` to the receiver. Refuses if the session is terminal or another call is already active on the same session.
- `POST /api/calls/:id/accept` — receiver accepts; flips to `accepted`, emits `call:accepted`.
- `POST /api/calls/:id/decline` — `declined` + `endReason=declined`.
- `POST /api/calls/:id/end` — `ended` + `endReason=caller_ended|receiver_ended`.
- `POST /api/calls/:id/missed` — marks missed if the ring timer fires out.
- SDP offer/answer and ICE candidates are exchanged via the socket events `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` scoped to the session room.

### 4.7 Notifications

- `POST /api/notifications` — internal/testing only (normally notifications are produced by other services).
- `GET /api/notifications` — paginated list for the caller.
- `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`.

Publishing in-app notifications is done via `publishNotification()` in `src/modules/notification/notification.publisher.ts`, which enqueues onto the `notifications` queue. The `notification.worker.ts` consumer persists the row and emits a socket event into the receiver's user room.

See `src/shared/constants/notification.constants.ts` for the full type tag list — it covers order, offer, session, call, bundle-booking, auth, and review events.

### 4.8 Reviews

- After a session completes, both sides get a `REVIEW_REQUIRED` notification.
- `POST /api/reviews` — creates a `Review` row. Unique by `(reviewerId, orderId)`.
- Service recomputes the target user's `averageRating`/`totalReviews` in the same transaction.
- Flips the order's `customerReviewed` or `supplierReviewed` flag.
- When both flags are true, fires `REVIEWS_COMPLETE`.
- The offer-creation path refuses to let a supplier take new work while they have a `completed` order with `supplierReviewed=false` — this is the "clear your reviews before continuing" gate.

### 4.9 Availability

Per supplier, a weekly schedule (7 day entries) + timezone + blocked dates.

- `GET /api/availability/me` — caller's availability (auto-created with defaults on first access).
- `GET /api/availability/supplier/:supplierId/slots?date=YYYY-MM-DD` — returns open slots for a specific date, respecting:
  - Working hours for that day of week.
  - Slot duration.
  - Optional break window.
  - `BlockedDate[]` full-day or partial overlays.
  - Existing `BundleBooking` and ad-hoc `Offer` windows on that date.

Used by the bundle booking flow and the supplier calendar.

### 4.10 Bundles

- `GET /api/bundles` — public feed, filterable by `categoryId`, `governmentId`, `supplierId`.
- `GET /api/bundles/me` — supplier's own bundles.
- `GET /api/bundles/:id`
- `POST /api/bundles` (supplier) — create.
- `PUT /api/bundles/:id`, `PATCH /api/bundles/:id/status`, `DELETE /api/bundles/:id`.

### 4.11 Bundle bookings

- `POST /api/bundle-bookings` — customer books a bundle into a slot. Validates:
  - Slot length matches `bundle.durationMinutes`.
  - No overlapping booking for supplier or customer on the same date.
  - Slot falls inside the supplier's weekly availability and is not blocked.
- `GET /api/bundle-bookings/customer`, `/supplier` — listings by role.
- `GET /api/bundle-bookings/:id`
- Status transitions (each is a `PATCH /:id/<action>`):
  - `accept` (supplier) — `pending_supplier_approval → accepted`.
  - `reject` (supplier) — → `rejected` with `rejectionReason`.
  - `propose-time` (supplier) — → `pending_customer_approval`, stores the `proposed*` fields.
  - `approve-proposed-time` (customer) — commits the proposal, goes to `accepted`.
  - `reject-proposed-time` (customer) — bounces back to `pending_supplier_approval`.
  - `start` (supplier) — `accepted → in_progress`. Spawns a JobSession if the `scheduledAt` is due.
  - `mark-done` (supplier) — `in_progress → done`.
  - `complete` (customer) — `done → completed`.
  - `cancel` (either) — → `cancelled`.
- The session-scheduler worker auto-starts bookings that are `accepted` + `scheduledAt <= now`.

### 4.12 Categories & Governments

Admin-managed taxonomy:
- `GET /api/categories`, `GET /api/categories/:id` (public).
- `POST/PUT/DELETE /api/categories/:id` (admin) — enqueues `category_jobs` events for downstream consumers.
- `GET /api/governments`, `GET /api/governments/active`, `GET /api/governments/:id` (public).
- `POST/PUT/DELETE /api/governments/:id` (admin).

---

## 5. Real-time: Socket.io rooms & events

Rooms (see `src/shared/config/socket.ts`):
- `user:<userId>` — personal notifications and anything addressed to one user.
- `supplier:category:<categoryId>:government:<governmentId>` — supplier feed broadcasts.
- `session:<sessionId>` — per-session updates (chat, calls, workflow advances).

Event name constants are grouped in each module's constants file (`CHAT_SOCKET_EVENTS`, `CALL_SOCKET_EVENTS`, etc.). Highlights:
- `order:new` / `order:removed` — supplier feed churn.
- `offer:created` / `offer:updated` / `offer:accepted` / `offer:rejected` — offer lifecycle.
- `session:advance` / `session:completed` / `session:cancelled`.
- `message:new`, `message:read`, `chat:sync`.
- `call:incoming`, `call:ringing`, `call:accepted`, `call:declined`, `call:ended`, `call:missed`, `call:failed`.
- `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` — WebRTC signaling.

---

## 6. Auth + authorization middleware

- `authenticate` — verifies `Authorization: Bearer <access>`; rejects 401 if invalid/expired; 403 if the refresh-session isn't in Redis.
- `authorize("supplier")` / `authorize("admin")` — role gate; must run after `authenticate`.
- JWT payload: `{ userId, role, iat, exp }`.
- Access token TTL: **15 minutes**. Refresh token TTL: **7 days**. Both signed with separate secrets (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`).
- Refresh tokens are **stored in Redis** keyed by `refresh:<userId>:<jti>`; logout deletes the key, so a stolen refresh token is revocable.

Rate limiting: global `100 req / 15 min` in production, `1000` in dev, applied to all routes.

---

## 7. Invariants and gotchas

- **One pending order per customer** — partial unique index. Prevents "spam orders".
- **One pending offer per (supplier, order)** — supplier can only update, not flood.
- **One accepted offer per order** — prevents a race from double-accepting.
- **One active session per customer, one per supplier** — no one can be double-booked live.
- **One active call per session**.
- **JobSession CHECK constraint**: must have exactly one parent group (`orderId+offerId`) or (`bundleBookingId`).
- **Review gate**: a supplier cannot take new work while their last completed order has `supplierReviewed=false`. Enforced in `OfferService.ensureSupplierCanCreateOffer` and the direct-accept path.
- **Session parent propagation**: cancelling a session resets the parent (order → pending, or booking → cancelled), **unless** the user explicitly asks for a full cancel.
- **Offer schedule normalization**: daily offers always snap start time to 09:00 local and duration to 8h. Do not ignore this in any code that compares offer times — a customer booking at 11:00 will still have offer `timeToStart` at 09:00.
- **Image/file storage**: Cloudinary `publicId` is the canonical reference; deleting an order/bundle should clean up Cloudinary assets.
- **Notifications are async**: publishing a notification is fire-and-forget via RabbitMQ; callers should never `await` the DB write.
- **Partial unique indexes are NOT expressed in Prisma** — they live in `prisma/partial-unique-indexes.sql` and must be applied after every `prisma migrate` generation. If you forget, the invariants above are only app-enforced and will race under load.
- **Money is `Decimal`, not `number`** — use `Prisma.Decimal` or convert at the service boundary. Comparing/adding raw numbers will silently lose precision.

---

## 8. Environment variables

```
DATABASE_URL              # Postgres connection string (Prisma)
REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD
RABBITMQ_URL
JWT_SECRET, REFRESH_TOKEN_SECRET
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
FROM_USER                 # Email sender address
CLIENT_URL                # Frontend URL (used in reset-password links)
BASE_URL                  # API base URL (used for health-check keep-alive pings)
NODE_ENV                  # development | production
PORT                      # Defaults to 6000
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY, TWILIO_API_SECRET
```

---

## 9. Commands

```bash
# Development (auto-reload via nodemon)
npm run dev

# Build TypeScript
npm run build

# Build in watch mode
npm run build:watch

# Run production server
npm start

# Prisma
npx prisma generate       # regenerate client after schema change
npx prisma migrate dev    # create + apply migration in dev
npx prisma migrate deploy # apply migrations in prod
npx prisma studio         # GUI browser

# After every migration: apply the partial unique indexes manually
psql "$DATABASE_URL" -f prisma/partial-unique-indexes.sql
```

No test or lint scripts are configured in `package.json`. Typecheck with `npx tsc --noEmit`.

---

## 10. File-level map (quick lookup)

| You want to… | Look at… |
| --- | --- |
| Add a new HTTP endpoint | `src/modules/<feature>/routes/*.ts` then controller → service → repo |
| Change a Mongo-era query | Now in Prisma — `src/modules/<feature>/repository/*.ts` |
| Add a new database model | `prisma/schema.prisma`, regenerate, update the affected repository |
| Add a new enum value | `src/shared/constants/<feature>.constants.ts` **and** `prisma/schema.prisma` enum block |
| Change notification behavior | `src/modules/notification/notification.publisher.ts` + the originating service |
| Add a socket event | `src/shared/config/socket.ts` + the emitter service + constants file |
| Change auth token TTL | `src/shared/utils/tokens.ts` (look for `15m` / `7d`) |
| Adjust rate limit | `src/app.ts` `rateLimit({...})` |
| Add a new background worker | `src/workers/<name>.worker.ts`, register in `src/server.ts` |
| Change RabbitMQ queue names | `src/shared/config/rabbitmq.ts` |
| Debug a workflow that's stuck | Check `JobSession.stepTimestamps` and the originating category's `workflows[]` — the step names must match exactly |

---

## 11. Migration status (2026-04-14) — ✅ COMPLETE

The codebase has been fully migrated from Mongoose/MongoDB to Prisma/PostgreSQL. `npx tsc --noEmit` passes with zero errors. `mongoose` is uninstalled. All `src/modules/*/models/` directories have been deleted.

**What's done:**
- `prisma/schema.prisma` — full schema with all 13 models, enums, relations, and regular indexes.
- `prisma/partial-unique-indexes.sql` — raw SQL for the predicate unique indexes Prisma cannot express, plus the JobSession parent CHECK constraint. **Must be applied manually after `prisma migrate dev`.**
- Prisma 6 installed, client generated.
- `src/shared/config/prisma.ts` — PrismaClient singleton with dev-mode query logging.
- `src/shared/config/database.ts` — `connectDB()` uses Prisma `$connect()`.
- `src/shared/config/socket.ts` — fully ported: WebRTC signaling, call state management, session access checks all use Prisma.
- **All 13 repositories** ported: `government`, `category`, `notification`, `review`, `chat`, `call`, `auth` (user), `availability`, `order`, `offer`, `session`, `bundle`, `bundleBooking`. Every method accepts an optional `tx: Prisma.TransactionClient` parameter.
- **All services ported**:
  - `government.service`, `category.service`, `notification.service` + `notification-event.service`, `chat.service`, `review.service`, `call.service` + `call-event.service`, `availability.service`, `bundle.service`, `order.service`, `offer.service`, `session.service`, `bundleBooking.service`, `auth.service`, `auth-device.service`, `user.service`.
  - All use `prisma.$transaction(async (tx) => {...})` for multi-step writes.
- **Workers ported**: `notification.worker`, `category.worker`, `session-scheduler.worker`. (`user.worker`, `email.worker` had no Mongoose dependencies.)
- **Utilities ported**: `buildSupplierOrderPayload`, `helpers` (`buildBundlePayload`, `validateFile`).
- **Shared types** (`src/shared/types/index.ts`) — stripped Mongoose imports, uses plain string IDs.
- All `src/modules/*/models/*.ts` Mongoose files **deleted** and the empty `models/` directories removed.
- **`mongoose` uninstalled** from `package.json`.

**Verification:** `npx tsc --noEmit` → 0 errors.

**Mechanical replacements** (apply everywhere):

| Mongoose | Prisma |
| --- | --- |
| `mongoose.startSession()` + `dbSession.withTransaction(async () => { ... })` + `finally { endSession() }` | `await prisma.$transaction(async (tx) => { ... })` — the `tx` is passed into repository methods instead of the old `dbSession` |
| `doc._id` / `doc._id.toString()` | `doc.id` (already a string uuid) |
| `new Types.ObjectId(str)` | delete it — ids are plain strings |
| `Types.ObjectId \| string` in type signatures | `string` |
| `.save()` | `prisma.<model>.update({ where: { id }, data: {...} })` |
| `.populate("foo")` | `include: { foo: true }` in the repository query (already done in most repos; callers need to `include`/`select` what they read) |
| `user.governmentIds` (ObjectId[]) | `user.governments.map(g => g.governmentId)` — join table is `UserGovernment` with `{ userId, governmentId }` |
| `.lean()` | remove — Prisma always returns plain objects |
| `UserModel.findById(id).select("-password -refreshToken -biometrics")` | `prisma.user.findUnique({ where: { id }, select: { /* explicit whitelist */ } })` — Prisma has no exclusion selector |
| `{ $in: [...] }` / `{ $nin: [...] }` | `{ in: [...] }` / `{ notIn: [...] }` |
| `{ $ne: x }` | `{ not: x }` |
| `{ $or: [...] }` / `{ $and: [...] }` | `{ OR: [...] }` / `{ AND: [...] }` |
| `.findByIdAndUpdate(id, { $set: {...} }, { new: true })` | `prisma.<model>.update({ where: { id }, data: {...} })` (Prisma returns updated by default) |
| `.updateMany(filter, { $set: {...} })` | `prisma.<model>.updateMany({ where, data })` |
| `.countDocuments(filter)` | `prisma.<model>.count({ where })` |
| `.sort({ foo: -1 })` | `orderBy: { foo: "desc" }` |
| `Map<string, Date>` (`stepTimestamps`) | `Json` field — read as `stepTimestamps as Record<string, Date>` |
| Status enum constants (`ORDER_STATUS.PENDING`) | Prisma-generated enums: `OrderStatus.pending`. **Note the case** — Prisma enums use the exact member name from `schema.prisma` |

**Transaction return values**: Prisma's `$transaction` callback returns a value. Prefer destructuring what you need out of the tx and using it after, rather than assigning to outer `let` variables (see the rewritten `review.service.ts` and `chat.service.ts` for the pattern).

**Decimal fields**: `amount`, `requestedPrice`, `finalPrice`, `price`, `oldPrice` are now `Prisma.Decimal`. Wrap incoming `number` as `new Prisma.Decimal(n)` when writing. When reading, call `.toNumber()` (or coerce with `Number(x)`) before arithmetic.

**Database setup (you still need to do this before running the app):**
1. Install Postgres locally, or use a cloud instance (Supabase/Neon/RDS).
2. Set `DATABASE_URL=postgresql://user:pass@host:5432/dbname` in `.env`.
3. Run `npx prisma migrate dev --name init` to generate the first migration and apply it.
4. **Apply the partial unique indexes manually** — Prisma's schema DSL can't express predicate uniques, so you must run:
   ```bash
   psql "$DATABASE_URL" -f prisma/partial-unique-indexes.sql
   ```
   This installs the 10 partial unique indexes and the JobSession parent CHECK constraint. Re-run this after every migration that might drop them.
5. Seed Governments and Categories — no seed script exists yet; use `npx prisma studio` or write one in `prisma/seed.ts`.

**If you later change the Prisma schema:**
- `npx prisma migrate dev --name <change>` to create + apply a new migration.
- `npx prisma generate` to regenerate the TypeScript client.
- Re-apply `prisma/partial-unique-indexes.sql` if the migration dropped any indexes it references.
