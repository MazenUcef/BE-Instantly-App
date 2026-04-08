# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (auto-reload via nodemon)
npm run dev

# Build TypeScript
npm run build

# Build in watch mode
npm run build:watch

# Run production server
npm start
```

No test or lint scripts are configured in package.json.

## Architecture Overview

This is a **Node.js/Express/TypeScript** REST API backend for a service marketplace platform. It uses a **modular layered architecture** with consistent patterns across all feature modules.

### Infrastructure

- **Database**: MongoDB via Mongoose
- **Cache**: Redis (ioredis)
- **Message Queue**: RabbitMQ (amqplib) — 4 queues: `USER_REGISTERED`, `notifications`, `email_jobs`, `category_jobs`
- **Real-time**: Socket.io
- **File Storage**: Cloudinary (via Multer for uploads)
- **Voice Calls**: Twilio
- **Auth**: JWT (access tokens 15m, refresh tokens 7d) + Redis session tracking

### Entry Points

- `src/server.ts` — Connects to MongoDB/Redis/RabbitMQ, starts 4 background workers, then starts the HTTP server on port 6000
- `src/app.ts` — Express app setup: Helmet, CORS, rate limiting (100 req/15min prod, 1000 dev), Socket.io init, route registration

### Module Structure

Every feature module under `src/modules/` follows this layered pattern:

```
modules/<feature>/
├── controllers/    # Request handlers (thin, delegate to services)
├── services/       # Business logic
├── repositories/   # All database access (static methods, supports Mongoose sessions)
├── models/         # Mongoose schemas + TypeScript interfaces
├── routes/         # Express route definitions with middleware chains
├── validators/     # express-validator rules
└── helpers/        # Module-specific utilities (not all modules)
```

Current modules: `auth`, `order`, `offer`, `session`, `chat`, `call`, `notification`, `review`, `category`, `government`, `availability`, `bundle`, `bundleBooking`.

### Workers

`src/workers/` contains RabbitMQ consumers that run as background processes alongside the server:
- `user.worker.ts` — handles user registration events
- `email.worker.ts` — processes email job queue
- `notification.worker.ts` — processes notification delivery
- `category.worker.ts` — handles category-related async jobs

### Shared Utilities

- `src/shared/config/` — database, redis, rabbitmq, socket, cloudinary, multer init
- `src/shared/middlewares/` — auth (JWT verification + RBAC), error handler, validation runner
- `src/shared/constants/` — enums per domain (order statuses, roles, session states, etc.)
- `src/shared/utils/` — OTP generation, email sending, token utilities, password hashing

### Socket.io Architecture

Room-based design in `src/shared/config/socket.ts`:
- Per-user rooms for personal notifications
- Per-supplier-category/government rooms for broadcast
- Per-session rooms for live session updates
- WebRTC signaling (offer/answer/ICE candidates) for video calls

### Key Patterns

**Repository pattern**: Controllers never access Mongoose models directly. All queries go through the repository layer. Repositories accept an optional Mongoose `session` parameter for multi-document transactions.

**Error handling**: Throw `AppError` (from `src/shared/utils/`) with HTTP status codes. The global error handler in `app.ts` normalizes Mongoose, JWT, and validation errors. Dev mode includes stack traces; prod mode sanitizes.

**Async messaging**: Use `publishToQueue(queueName, payload)` from `src/shared/config/rabbitmq.ts` to dispatch background tasks instead of blocking the request.

**Validation**: Each route attaches a validator array (express-validator), then the shared `validate` middleware runs the checks before the controller is reached.

### Environment Variables

```
MONGODB_URI
REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD
RABBITMQ_URL
JWT_SECRET, REFRESH_TOKEN_SECRET
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
FROM_USER           # Email sender address
CLIENT_URL          # Frontend URL (used in reset-password links)
BASE_URL            # API base URL (used for health-check keep-alive pings)
NODE_ENV            # development | production
PORT                # Defaults to 6000
```
