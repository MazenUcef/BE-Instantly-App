# Instantly App — Backend Overview

## What Is Instantly?

Instantly is a **service marketplace platform** that connects **customers** who need on-demand or scheduled services with **suppliers** (service providers) who fulfil them. Think of it as an Uber-like model applied to general service work — a customer describes a job (e.g. plumbing, car repair, tutoring), suppliers in the matching category and geographic area compete by submitting offers, and once an offer is accepted the two parties enter a live session where work is tracked, payments are confirmed, and reviews are exchanged.

The platform is localised for **Egypt** (default timezone `Africa/Cairo`, bilingual Arabic/English government names, Egyptian governorate-based service areas).

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Customer** | A user who creates orders, books bundles, and pays for services. |
| **Supplier** | A user who offers services in a specific category and set of governorates. Has a configurable weekly availability schedule. |
| **Admin** | Manages the platform catalog — categories, governorates, and their active/inactive status. |
| **Category** | A type of service (e.g. "Plumbing", "Car Repair"). Each category defines available job titles and configurable **workflows** (ordered steps that describe how a job progresses). |
| **Government** | A geographic service area (Egyptian governorate). Orders and bundles are scoped to one or more governments. |
| **Order** | A customer's service request. Contains a description, requested price, job title, images/documents, selected workflow, and target governorate. |
| **Offer** | A supplier's bid on an open order — includes price, estimated duration, and proposed start time. Offers auto-expire via a TTL index. |
| **Bundle** | A pre-packaged service offering created by a supplier — fixed price, duration, and description. Customers can book bundles directly instead of creating open orders. |
| **Bundle Booking** | A reservation of a bundle at a specific date/time slot. Supports a negotiation flow where either party can propose alternative times. |
| **Session (JobSession)** | The active work period between a customer and supplier. Created when an offer is accepted or a bundle booking starts. Tracks workflow step completion with timestamps. |
| **Call** | An audio or video call between session participants, facilitated via WebRTC signalling through Socket.io. |
| **Review** | A 1–5 star rating with comment, submitted by both parties after a session completes. Both must review before either can start a new job. |

---

## User Flows

### Flow 1 — Order-Based (Open Marketplace)

```
Customer creates Order
        │
        ▼
Order broadcast to suppliers in matching category + government
        │
        ▼
Suppliers submit Offers (price, duration, start time)
   ── or ──
Supplier accepts Order directly (no negotiation)
        │
        ▼
Customer accepts one Offer → other offers auto-rejected
        │
        ▼
Session created (immediately or at scheduled time)
        │
        ▼
Supplier progresses through workflow steps
        │
        ▼
Session marked done → Payment confirmed → Session completed
        │
        ▼
Both parties leave Reviews → ratings updated
```

### Flow 2 — Bundle-Based (Pre-Packaged Service)

```
Supplier creates Bundle (fixed price, description, duration)
        │
        ▼
Customer books Bundle → picks date + time slot
        │
        ▼
Supplier accepts, rejects, or proposes alternative time
   (negotiation loop until both agree)
        │
        ▼
Booking accepted → Session created at scheduled time
        │
        ▼
Supplier progresses through workflow steps
        │
        ▼
Marked done → Payment confirmed → Completed
        │
        ▼
Both parties leave Reviews
```

---

## Feature Breakdown

### Authentication & Identity
- **Email/password registration** with OTP-based email verification.
- **JWT authentication** — 15-minute access tokens, 7-day refresh tokens stored in Redis.
- **Biometric login** — supports Face ID, fingerprint, and device passcode via registered devices.
- **Role switching** — a single user account can switch between customer and supplier roles, selecting a category and governorates when acting as supplier.
- **Brute-force protection** — account locks for 15 minutes after 5 failed login attempts (Redis-tracked).
- **Password reset** — OTP-verified flow with rate limiting (3 attempts/hour, 5 OTP verifications per window).

### Orders & Offers
- Customers create orders with up to **5 images** and **3 documents** (PDF, Word, Excel) uploaded to Cloudinary.
- Only **one pending order** allowed per customer at a time (enforced by partial unique index).
- Suppliers see orders filtered to their **category + governorates** in a real-time feed.
- Offers include scheduling — suppliers propose a `timeToStart` and the system checks for **time conflicts** against their other scheduled offers and bundle bookings.
- Only **one pending offer per supplier per order** and **one accepted offer per order** (partial unique indexes).
- Offers have a configurable **TTL** — MongoDB automatically deletes expired offers.

### Bundles & Bookings
- Suppliers create service bundles with a title, description, price, duration (15 min–4 hours), included features, and tags.
- Bookings support a **time negotiation protocol** — either party can propose a new time, and the other accepts or counter-proposes.
- **Slot conflict checking** — the system validates proposed times against the supplier's existing bookings and the customer's existing bookings.
- Status lifecycle: `pending_supplier_approval` → `accepted` / `rejected` → `in_progress` → `done` → `completed` (after payment) / `cancelled`.

### Sessions & Workflows
- A session is created automatically when an offer is accepted or a booking starts.
- Each session carries **workflow steps** defined by the category (e.g. "Diagnose → Quote → Repair → Verify").
- Steps are completed one at a time; each step is timestamped in a `stepTimestamps` map.
- A **background scheduler** (runs every 2 minutes) checks for scheduled orders/bookings that are due and auto-creates sessions.
- Only **one active session per customer** and **one per supplier** at a time (partial unique indexes).

### Real-Time Communication
- **Socket.io** powers all real-time features with JWT-authenticated connections.
- **Room structure:**
  - `user_{id}` — personal notifications, offer updates, call events.
  - `category_{id}_government_{id}` — supplier feed for new/updated orders.
  - `chat_{sessionId}` — session chat room.
- **Chat** — text messaging between session participants with read receipts and delivery timestamps.
- **Calls** — audio/video calls via WebRTC, with Socket.io relaying offer/answer/ICE candidates. STUN/TURN server config provided via API.

### Supplier Availability
- Suppliers define a **weekly schedule** (7 days, each with start/end times, optional break, configurable slot duration).
- **Blocked dates** can be added with optional partial-day blocking (specific time range or full day).
- A **calendar API** returns the supplier's availability for an entire month, and a **booked-times API** returns occupied slots for a specific date.

### Notifications
- Centralized notification system — all modules publish to a `notifications` RabbitMQ queue.
- A background worker persists notifications to MongoDB and broadcasts via Socket.io in real-time.
- Covers order events, offer events, session lifecycle, bundle booking events, call events, and more.
- Supports mark-as-read (individual and bulk) with unread count tracking.

### Reviews & Ratings
- Both customer and supplier must review after a completed session.
- One review per reviewer per order (unique compound index).
- User `averageRating` and `totalReviews` are updated atomically on each new review.
- Unreviewed completed orders/sessions **block** the user from creating new orders or offers — enforcing the review requirement.

---

## Technical Architecture

### Stack
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | MongoDB (Mongoose ODM) |
| Cache / Sessions | Redis (ioredis) |
| Message Queue | RabbitMQ (amqplib) |
| Real-Time | Socket.io |
| File Storage | Cloudinary (via Multer) |
| Voice/Video | WebRTC (signalling via Socket.io) |
| Auth | JWT (jsonwebtoken) |

### Module Structure
Every feature follows a consistent layered pattern:
```
modules/<feature>/
├── controllers/    # Thin request handlers
├── services/       # Business logic
├── repositories/   # Database access (static methods, session-aware)
├── models/         # Mongoose schemas + TypeScript interfaces
├── routes/         # Express routes with middleware chains
├── validators/     # express-validator rule sets
└── helpers/        # Module-specific utilities
```

### Background Workers
| Worker | Queue | Purpose |
|--------|-------|---------|
| Email Worker | `email_jobs` | Sends welcome emails, OTPs, password reset links |
| Notification Worker | `notifications` | Persists and broadcasts notifications |
| User Worker | `USER_REGISTERED` | Triggers post-registration OTP email + welcome notification |
| Category Worker | `CATEGORY_CREATED` | Broadcasts new category announcements to customers |
| Session Scheduler | *(cron, every 2 min)* | Auto-starts sessions for due scheduled orders/bookings |

### Data Integrity
- **MongoDB transactions** protect all multi-document operations (order creation, offer acceptance, session lifecycle, review creation).
- **Partial unique indexes** enforce business rules at the database level:
  - One pending order per customer
  - One pending offer per supplier per order
  - One accepted offer per order
  - One active session per customer/supplier
  - One active session per order/offer/booking
- **TTL indexes** auto-expire offers.
- **Redis rate limiting** protects login, OTP, and password reset flows.

---

## API Surface

The API is mounted at `/api/` with the following route groups:

| Prefix | Module | Key Operations |
|--------|--------|---------------|
| `/api/auth` | Auth | Register, login, OTP verification, password reset, biometric auth, role switching |
| `/api/categories` | Category | CRUD (admin), public listing |
| `/api/governments` | Government | CRUD (admin), public listing, toggle status |
| `/api/orders` | Order | Create (customer), cancel, update price, get active feed (supplier), timeline, history |
| `/api/offers` | Offer | Create/delete (supplier), accept/reject (customer), direct accept, history |
| `/api/bundles` | Bundle | CRUD (supplier), filtered listing |
| `/api/bundle-bookings` | Bundle Booking | Create (customer), accept/reject/propose-time, start/done/confirm-payment (supplier), cancel |
| `/api/sessions` | Session | Status updates, complete, confirm payment, get active/resume session |
| `/api/chat` | Chat | Send message, get messages, mark read |
| `/api/calls` | Call | Start/accept/decline/end call, ICE config, call history |
| `/api/notifications` | Notification | List, mark read, mark all read |
| `/api/reviews` | Review | Create, get by order/user |
| `/api/availability` | Availability | Supplier calendar, booked time slots |

---

## Summary

Instantly is a full-featured, real-time service marketplace backend that handles the complete lifecycle from service request to payment confirmation and mutual review. It combines a competitive bidding model (orders + offers) with a direct booking model (bundles), supports real-time chat and video calls during active sessions, and enforces business rules through a combination of application logic, database constraints, and background workers.
