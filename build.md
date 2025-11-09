# SourceNet Backend - Full Implementation Prompt

You are building the SourceNet backend - a decentralized data marketplace on Sui blockchain.

## Project Context
- Framework: Express.js + TypeScript
- Blockchain: Sui (ZKLogin, Sponsored Tx, Kiosk, PTB)
- Database: PostgreSQL + Prisma
- Storage: Walrus (encrypted blobs)
- Encryption: secp256k1 + AES-256-GCM (hybrid)
- Key Feature: Per-buyer re-encryption (seller can't decrypt sold data)

## Your Tasks (Priority Order)

### 1. Core Setup Files (IMMEDIATE)
- `src/index.ts` - Express app initialization with middleware
- `src/config/database.ts` - PostgreSQL + Prisma client
- `src/config/sui.ts` - Sui RPC client configuration
- `tsconfig.json` - TypeScript config for Node.js
- `package.json` - Dependencies manifest
- `.env.example` - Environment variables template
- `prisma/schema.prisma` - Complete Prisma DB schema

### 2. Authentication Layer (DAYS 1-2)
- `src/blockchain/sui/zklogin.ts` - ZKLogin wrapper (verify JWT, extract pubkey)
- `src/blockchain/sui/client.ts` - Sui RPC client & transaction builder
- `src/services/auth.service.ts` - Auth business logic (create ephemeral wallet, verify session)
- `src/api/middleware/auth.middleware.ts` - JWT validation middleware
- `src/api/routes/auth.routes.ts` - POST /auth/zklogin, GET /auth/wallet endpoints
- `src/api/controllers/auth.controller.ts` - Controller logic

### 3. Encryption Layer (DAYS 2-3)
- `src/crypto/hybrid.ts` - Hybrid encryption/decryption (secp256k1 + AES-256-GCM)
- `src/crypto/hashing.ts` - SHA256 hashing for integrity
- `src/services/encryption.service.ts` - Re-encryption service (decrypt with seller key → re-encrypt with buyer key)
- `src/crypto/keyDerivation.ts` - Key derivation utilities

### 4. Data Upload Layer (DAYS 3-4)
- `src/storage/database/prisma.ts` - Prisma client instance
- `src/services/data.service.ts` - Upload, encrypt, store data
- `src/api/routes/data.routes.ts` - POST /data/upload, GET /data/list, GET /data/:id
- `src/api/controllers/data.controller.ts` - Data upload controller
- `src/api/validators/data.validators.ts` - Zod validators for data upload

### 5. Purchase & Escrow (DAYS 4-5)
- `src/blockchain/sui/ptb.ts` - Programmable Transaction Block builder
- `src/blockchain/escrow/escrow.service.ts` - Escrow smart contract interactions
- `src/services/purchase.service.ts` - Purchase request logic
- `src/api/routes/purchase.routes.ts` - POST /purchase/create, GET /purchase/:id
- `src/api/controllers/purchase.controller.ts` - Purchase controller

### 6. Fulfillment Pipeline (DAYS 5-6)
- `src/services/fulfillment.service.ts` - Core: decrypt original → re-encrypt → upload to Walrus → release escrow
- `src/storage/walrus/client.ts` - Walrus SDK wrapper
- `src/storage/walrus/upload.ts` - Upload encrypted blob to Walrus
- `src/jobs/reencryption.job.ts` - Async re-encryption job (BullMQ)
- `src/jobs/walrusUpload.job.ts` - Async Walrus upload job
- `src/api/routes/fulfillment.routes.ts` - POST /fulfillment/:id/fulfill
- `src/api/controllers/fulfillment.controller.ts` - Fulfillment controller

### 7. Marketplace (DAYS 6-7)
- `src/services/marketplace.service.ts` - Query DataPods, search, filter
- `src/api/routes/marketplace.routes.ts` - GET /marketplace/browse, GET /marketplace/search
- `src/api/controllers/marketplace.controller.ts` - Marketplace controller
- `src/utils/logger.ts` - Pino logger setup
- `src/api/middleware/error.middleware.ts` - Global error handler

### 8. Smart Contracts (DAYS 7-8)
- `contracts/escrow/sources/escrow.move` - Sui Move smart contract (CreatePurchaseRequest, FulfillPurchaseRequest, ReleaseEscrow)
- `contracts/escrow/Move.toml` - Move package manifest

### 9. Testing & Docker (DAYS 8-10)
- `tests/unit/encryption.test.ts` - Unit tests for encryption
- `tests/integration/auth.integration.ts` - Integration tests for auth flow
- `docker/Dockerfile` - Node.js Docker image
- `docker/docker-compose.yml` - PostgreSQL + Redis + app stack
- README.md - Setup & deployment guide

## Requirements for Each File

### Encryption Implementation
- Use `secp256k1` for asymmetric encryption (buyer pubkey)
- Use `AES-256-GCM` for data encryption
- Hybrid: Encrypt AES key with pubkey, encrypt data with AES key
- Hash verification with SHA256

### Database Schema
- User (ZKLogin user with ephemeral wallet)
- DataPod (encrypted plaintext + metadata)
- PurchaseRequest (escrow state + buyer_pubkey)
- AuditLog (for compliance)

### API Design
- All endpoints return JSON { success, data, error }
- Authenticated endpoints require Bearer token
- Rate limiting on public endpoints
- Input validation with Zod

### Error Handling
- Custom error classes (AuthError, EncryptionError, StorageError)
- Global error middleware catches all errors
- Structured logging with Pino

## Code Style
- TypeScript strict mode enabled
- Use interfaces for type safety
- Async/await for all async operations
- Error messages: user-friendly + logged with stack traces
- Comments on complex logic (especially crypto)

## Testing Requirements
- Unit tests for crypto functions
- Integration tests for auth + purchase flows
- E2E tests for complete marketplace flow

## Deployment
- Docker containerization
- Environment variable injection
- Database migrations with Prisma
- Redis for caching

## DO NOT
- Don't hardcode secrets
- Don't log sensitive data (private keys, plaintext)
- Don't use synchronous crypto operations
- Don't store plaintext data unencrypted
- Don't skip error handling

## START WITH
1. Create all empty TypeScript files (already done via terminal)
2. Implement `src/config/database.ts` first (foundation)
3. Then `src/blockchain/sui/client.ts` (Sui integration)
4. Then auth layer
5. Then encryption layer
6. Then everything else in order

## File Generation Pattern
For each file you create:
1. Add proper imports at top
2. Use TypeScript interfaces/types
3. Add JSDoc comments
4. Export class or functions
5. Include error handling
6. Add TODO comments if incomplete

Go build SourceNet! 🚀