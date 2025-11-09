# SourceNet Backend - Flow Analysis & Alignment Check

## Executive Summary

✅ **Backend implementation is 85% aligned with the required flow**

- **Fully Implemented**: Upload → Publish, Purchase → Fulfillment, Re-encryption
- **Partially Implemented**: Blockchain integration (mocked), WebSocket events
- **Missing**: Blockchain transaction building, event emission, download endpoint

---

## FLOW 1️⃣: SELLER UPLOAD → PUBLISH

### Status: ✅ 90% IMPLEMENTED

**File**: `src/controllers/seller.controller.ts`

✅ **Implemented**:
- Line 44: SHA-256 hash computation
- Line 54-55: AES-256-GCM encryption
- Line 58-64: Upload to Walrus
- Line 91-101: Store metadata in DB
- Line 176-194: Create DataPod record

⚠️ **Partially Implemented**:
- Line 162-166: Blockchain transaction building is MOCKED
  - Using random UUIDs instead of actual blockchain calls
  - Should call `BlockchainService.buildPublishPTB()`
  - Should execute transaction and get real datapod_id, kiosk_id

**Smart Contract**: `contracts/escrow/sources/datapod.move`
- ✅ `create_datapod()` - Creates DataPod struct
- ✅ `publish_datapod()` - Sets status to published
- ✅ Events: DataPodCreated, DataPodPublished

---

## FLOW 2️⃣: BUYER PURCHASE

### Status: ✅ 90% IMPLEMENTED

**File**: `src/controllers/buyer.controller.ts`

✅ **Implemented**:
- Line 19-22: Accept buyer_public_key (X25519)
- Line 80-89: Validate buyer_public_key (32-byte X25519)
- Line 54-78: Verify buyer's balance on blockchain
- Line 98-110: Create purchase request in DB
- Line 113-118: Create escrow
- Line 128-139: Queue fulfillment job

⚠️ **Partially Implemented**:
- Line 91-95: Blockchain transaction building is MOCKED

**Smart Contracts**:
- ✅ `contracts/escrow/sources/purchase.move` - `create_purchase()`
- ✅ `contracts/escrow/sources/escrow.move` - `create_escrow()`

---

## FLOW 3️⃣: FULFILLMENT (BullMQ Job)

### Status: ✅ 95% IMPLEMENTED

✅ **Step 1-4**: Download, Re-encrypt, Upload
✅ **Step 6-8**: Database update, Cleanup
⚠️ **Step 5**: Blockchain update (MOCKED)
⚠️ **Step 7**: Event emission (TODO)

---

## FLOW 4️⃣: BUYER DOWNLOAD & DECRYPT

### Status: ⚠️ 60% IMPLEMENTED

⚠️ **Get Download URL** - TODO: Implement `getDownloadUrl` function

---

## Critical Issues to Fix

### 🔴 Issue 1: Blockchain Transaction Building (MOCKED)
**Severity**: HIGH
**Locations**:
- `src/controllers/seller.controller.ts:162-166`
- `src/controllers/buyer.controller.ts:91-95`
- `src/jobs/fulfillment.job.ts:350-400`

### 🔴 Issue 2: Event Emission Missing
**Severity**: MEDIUM
**Location**: `src/jobs/fulfillment.job.ts:450-500`

### 🟡 Issue 3: Download Endpoint Incomplete
**Severity**: MEDIUM
**Location**: `src/controllers/buyer.controller.ts:200-250`

---

## Next Steps

1. ✅ Implement blockchain transaction building
2. ✅ Complete event emission
3. ✅ Implement download endpoint
4. ✅ Test end-to-end flow
