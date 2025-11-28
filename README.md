# SourceNet - Decentralized Data Marketplace

<div align="center">

![SourceNet Logo](./public/sourcenet.png)

**A Decentralized Data Marketplace Built on SUI Blockchain**

[![Express.js](https://img.shields.io/badge/Express.js-4.18.2-black)](https://expressjs.com/)
[![Move](https://img.shields.io/badge/Move-1.0-black)](https://move-language.org/)
[![Redis](https://img.shields.io/badge/Redis-7.2-black)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-black)](https://www.postgresql.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-1.0-black)](https://websocket.org/)
[![BullMQ](https://img.shields.io/badge/BullMQ-1.0-black)](https://github.com/RedisBull/bullmq)
[![Node.js](https://img.shields.io/badge/Node.js-20.11.0-black)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![SUI](https://img.shields.io/badge/SUI-Testnet-6FBCF0)](https://sui.io/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

SourceNet is a decentralized data marketplace built on **Sui Blockchain** with **Walrus Protocol** for secure, decentralized data storage. This platform enables data sellers to monetize their datasets and buyers to securely purchase and access data through blockchain-powered escrow and encryption.

---

## 📑 Table of Contents

### Backend
- [🌐 Architecture Overview](#-architecture-overview)
- [🤖 AI Integration](#-ai-integration)
- [🐋 Walrus Protocol Integration](#-walrus-protocol-integration)
- [🔄 Technical Flows](#-technical-flows)
- [🛠️ Tech Stack](#️-tech-stack)
- [⚙️ Prerequisites](#️-prerequisites)
- [📦 Installation](#-installation)
- [🔐 Environment Variables](#-environment-variables)
- [🚀 Running the Application](#-running-the-application)
- [📊 Database Schema](#-database-schema)
- [🔌 API Endpoints](#-api-endpoints)
- [🔄 WebSocket Events](#-websocket-events)
- [🔒 Security](#-security)

### Smart Contracts
- [⛓️ Smart Contracts Overview](#️-smart-contracts-overview)
- [🔁 Smart Contract Flows](#-smart-contract-flows)
- [📝 Contract Modules](#-contract-modules)
- [🏗️ Building & Testing](#️-building--testing)
- [🚢 Deployment](#-deployment)

### Development
- [🧪 Testing](#-testing)
- [📝 Contributing](#-contributing)
- [📄 License](#-license)

---
Frontend Repo: [SourceNet Frontend](https://github.com/HusseinHato/sourcenet_fe)
Landing Page Repo: [SourceNet Landing Page](https://github.com/pramadanif/sourcenet-walrushackathon-sui)
Docs: [SourceNet Docs](https://sourcenet.vercel.app/docs)

## 🌐 Architecture Overview

SourceNet follows a microservices-oriented architecture:

```mermaid
graph TB
    subgraph "Client Layer"
        FE[Frontend<br/>Next.js]
    end
    
    subgraph "API Layer"
        API[Backend API<br/>Express.js]
        WS[WebSocket Server<br/>Real-time Events]
        AUTH[Authentication<br/>ZKLogin + JWT]
    end
    
    subgraph "Processing Layer"
        QUEUE[Job Queue<br/>BullMQ]
        WORKER[Background Workers<br/>Data Processing]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL<br/>Primary Database)]
        CACHE[(Redis<br/>Cache + Sessions)]
    end
    
    subgraph "Blockchain Layer"
        BC[Sui Blockchain<br/>Smart Contracts]
        SC1[DataPod Module]
        SC2[Purchase Module]
        SC3[Escrow Module]
    end
    
    subgraph "Storage Layer"
        WALRUS[Walrus Protocol<br/>Decentralized Storage]
    end
    
    subgraph "External Services"
        AI[OpenAI API<br/>AI Assistant]
    end
    
    %% Client connections
    FE -->|HTTP/REST| API
    FE <-->|WebSocket| WS
    FE -->|Auth Request| AUTH
    
    %% API connections
    API --> DB
    API --> CACHE
    API --> QUEUE
    API --> BC
    API --> WALRUS
    API --> AI
    AUTH --> DB
    AUTH --> CACHE
    
    %% Processing
    QUEUE --> WORKER
    WORKER --> DB
    WORKER --> WALRUS
    WORKER --> BC
    
    %% WebSocket
    WS --> CACHE
    WS --> DB
    
    %% Blockchain modules
    BC --> SC1
    BC --> SC2
    BC --> SC3
    
    %% Styling
    style FE fill:#4F46E5,stroke:#312E81,color:#fff,stroke-width:2px
    style API fill:#059669,stroke:#065F46,color:#fff,stroke-width:2px
    style WS fill:#059669,stroke:#065F46,color:#fff,stroke-width:2px
    style AUTH fill:#059669,stroke:#065F46,color:#fff,stroke-width:2px
    style QUEUE fill:#F59E0B,stroke:#D97706,color:#fff,stroke-width:2px
    style WORKER fill:#F59E0B,stroke:#D97706,color:#fff,stroke-width:2px
    style DB fill:#7C3AED,stroke:#5B21B6,color:#fff,stroke-width:2px
    style CACHE fill:#7C3AED,stroke:#5B21B6,color:#fff,stroke-width:2px
    style BC fill:#DC2626,stroke:#991B1B,color:#fff,stroke-width:2px
    style SC1 fill:#EF4444,stroke:#B91C1C,color:#fff,stroke-width:2px
    style SC2 fill:#EF4444,stroke:#B91C1C,color:#fff,stroke-width:2px
    style SC3 fill:#EF4444,stroke:#B91C1C,color:#fff,stroke-width:2px
    style WALRUS fill:#EA580C,stroke:#9A3412,color:#fff,stroke-width:2px
    style AI fill:#8B5CF6,stroke:#6D28D9,color:#fff,stroke-width:2px
```

### Key Components

1. **Backend API** - Express.js server handling REST endpoints
2. **Database** - PostgreSQL for data persistence
3. **Cache Layer** - Redis for caching and rate limiting
4. **Blockchain Integration** - Sui Move smart contracts for escrow & data ownership
5. **Storage Layer** - Walrus Protocol for decentralized file storage
6. **Real-time Layer** - WebSocket for live updates
7. **Job Queue** - BullMQ for background processing

---

## 🤖 AI Integration

SourceNet integrates **AI-powered assistance** using **OpenAI** (via OpenRouter) to help users navigate the platform, understand DataPods, and make informed decisions.

### Key Features

- **Conversational AI**: Multi-turn conversations with full context awareness
- **DataPod Context**: AI understands specific DataPods being viewed
- **Conversation History**: Save and retrieve past conversations
- **Token Tracking**: Monitor AI usage and costs
- **Rate Limiting**: Protected against abuse (20 req/min per user, 100 req/min per IP)

### AI Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ai/chat` | Send message and get AI response |
| `GET` | `/api/ai/conversations` | List user's conversations (paginated) |
| `GET` | `/api/ai/conversations/:id` | Get full conversation with messages |
| `DELETE` | `/api/ai/conversations/:id` | Delete conversation |

### Example Usage

```typescript
// Send a message to AI
POST /api/ai/chat
{
  "message": "How do I create a DataPod?",
  "conversationId": "optional-conversation-id",
  "context": {
    "dataPodId": "uuid",
    "page": "seller-dashboard"
  }
}

// Response
{
  "success": true,
  "data": {
    "conversationId": "uuid",
    "message": "To create a DataPod...",
    "timestamp": "2024-11-25T09:28:00Z",
    "tokens": { "total": 150 }
  }
}
```

### Architecture

```mermaid
flowchart TD
    A[Frontend] -->|POST /api/ai/chat| B[AI Controller<br/>Auth + Rate Limiting]
    B --> C[AI Service<br/>- Context build<br/>- OpenAI call]
    C <--> D[(PostgreSQL<br/>- Conversations<br/>- Messages)]
    C <--> E[OpenRouter<br/>OpenAI]
    
    style A fill:#4F46E5,stroke:#312E81,color:#fff
    style B fill:#059669,stroke:#065F46,color:#fff
    style C fill:#7C3AED,stroke:#5B21B6,color:#fff
    style D fill:#DC2626,stroke:#991B1B,color:#fff
    style E fill:#EA580C,stroke:#9A3412,color:#fff
```

### AI System Prompt

The AI is configured with knowledge about SourceNet's:
- Marketplace features and data upload/purchase flows
- Sui blockchain integration and escrow mechanisms
- Walrus decentralized storage
- ZKLogin authentication
- Review and rating system

📖 **Full Documentation**: [AI Integration Guide](./docs/AI_INTEGRATION_GUIDE.md)

---

## 🐋 Walrus Protocol Integration

SourceNet uses **Walrus Protocol** for decentralized, immutable data storage on the Sui blockchain ecosystem.

### Why Walrus?

- **Decentralized**: No single point of failure
- **Immutable**: Data cannot be altered once stored
- **Blockchain-Native**: Built for Sui ecosystem
- **Cost-Effective**: Lower storage costs compared to traditional solutions
- **High Availability**: Distributed across multiple nodes

### Walrus Storage Flow

```mermaid
flowchart TD
    A[Upload Request] -->|1. Encrypt file with<br/>symmetric key| B[Storage Service<br/>StorageService.uploadToWalrus]
    B -->|2. Upload to Walrus Publisher<br/>POST /v1/store| C[Walrus Publisher Node<br/>Testnet: walrus-testnet]
    C -->|3. Returns blob_id<br/>unique identifier| D[Walrus Distributed Storage<br/>- Data split into erasure-coded chunks<br/>- Distributed across storage nodes<br/>- Stored with redundancy]
    D -->|4. Save blob_id to PostgreSQL| E[(Database Record<br/>- datapod.blobId<br/>- purchaseRequest.encryptedBlobId)]
    
    style A fill:#4F46E5,stroke:#312E81,color:#fff
    style B fill:#059669,stroke:#065F46,color:#fff
    style C fill:#7C3AED,stroke:#5B21B6,color:#fff
    style D fill:#EA580C,stroke:#9A3412,color:#fff
    style E fill:#DC2626,stroke:#991B1B,color:#fff
```

### Download Flow

```mermaid
flowchart TD
    A[Download Request] -->|1. Fetch blob_id<br/>from database| B[Storage Service<br/>StorageService.downloadFromWalrus]
    B -->|2. Retrieve from Walrus Gateway<br/>GET /ipfs/blob_id| C[Walrus Gateway<br/>- Aggregates chunks<br/>- Reconstructs original file]
    C -->|3. Returns encrypted<br/>file buffer| D[Backend API<br/>- Stream to buyer<br/>- Include decryption key in header]
    
    style A fill:#4F46E5,stroke:#312E81,color:#fff
    style B fill:#059669,stroke:#065F46,color:#fff
    style C fill:#EA580C,stroke:#9A3412,color:#fff
    style D fill:#7C3AED,stroke:#5B21B6,color:#fff
```

### Walrus Configuration

```typescript
// Environment Variables
WALRUS_API_URL=https://publisher.walrus-testnet.walrus.space
WALRUS_BLOB_ENDPOINT=https://blobs.testnet.walrus.io

// Storage Service Configuration
const GATEWAY_URL = 'https://gateway.walrus.space/ipfs';
const REQUEST_TIMEOUT = 30000; // 30 seconds
```

### Key Operations

#### Upload File
```typescript
const result = await StorageService.uploadToWalrus(file, 'uploads');
// Returns: { cid: 'blob_id', url: 'https://gateway...', size: 12345 }
```

#### Download File
```typescript
const buffer = await StorageService.downloadFromWalrus(blobId);
// Returns: Buffer containing encrypted file
```

#### Verify File Exists
```typescript
const exists = await StorageService.verifyFileExists(blobId);
// Returns: boolean
```

### Data Encryption with Walrus

1. **Seller Upload**: File encrypted with random symmetric key → Uploaded to Walrus
2. **Storage**: Walrus stores encrypted blob, returns `blob_id`
3. **Purchase**: Backend re-encrypts file with buyer's public key → New Walrus blob
4. **Download**: Buyer retrieves encrypted blob → Decrypts locally with private key

### Walrus vs Traditional Storage

| Feature | Walrus | AWS S3 | IPFS |
|---------|---------|--------|------|
| Decentralization | ✅ Full | ❌ Centralized | ✅ Full |
| Immutability | ✅ Yes | ⚠️ Optional | ✅ Yes |
| Blockchain Native | ✅ Sui | ❌ No | ⚠️ Partial |
| Cost | 💰 Low | 💰💰 Medium | 💰 Variable |
| Availability | ⚡ High | ⚡⚡⚡ Very High | ⚡⚡ Medium |
| Erasure Coding | ✅ Built-in | ❌ No | ❌ No |

---

## 🔄 Technical Flows

### Backend Technical Flows

#### 1. Seller Data Upload & Publish Flow

```mermaid
sequenceDiagram
    participant S as Seller
    participant B as Backend API
    participant W as Walrus Storage
    participant DB as PostgreSQL
    participant BC as Sui Blockchain
    participant WS as WebSocket
    
    S->>B: 1. POST /api/seller/upload<br/>(file, metadata)
    Note over B: 2. Validate file & metadata<br/>3. Generate data hash<br/>4. Encrypt file
    B->>W: 5. Upload encrypted file
    W-->>B: Returns blob_id
    B->>DB: 6. Store staging data<br/>(sellerId, blob_id, dataHash)
    DB-->>S: Return staging_id
    
    Note over S: 7. Seller reviews and confirms
    
    S->>B: 8. POST /api/seller/publish
    Note over B: 9. Prepare blockchain transaction
    B->>BC: 10. datapod::create
    BC-->>B: Returns datapod_id<br/>Event: DataPodCreated
    Note over B: 11. Sponsor gas & submit
    B->>DB: 12. Insert DataPod record<br/>(datapodId, blobId, status: published)
    B->>WS: 13. Broadcast event<br/>(datapod.published)
    WS-->>S: SUCCESS
```

**Key Steps:**
1. File validation and encryption
2. Upload to Walrus decentralized storage
3. Create staging record in database
4. Create on-chain DataPod object
5. Gas sponsorship by backend
6. Database record creation
7. Real-time WebSocket broadcast

---

#### 2. Buyer Purchase Flow

```mermaid
sequenceDiagram
    participant B as Buyer
    participant API as Backend API
    participant BC as Sui Blockchain
    participant DB as PostgreSQL
    participant Q as BullMQ
    participant W as Walrus Storage
    participant WS as WebSocket
    
    B->>API: 1. POST /api/buyer/purchase<br/>(datapodId, buyerPublicKey)
    Note over API: 2. Validate datapod<br/>3. Check no duplicate<br/>4. Generate purchase_id
    API->>BC: 5. purchase::create
    BC-->>API: PurchaseRequest created<br/>Event: PurchaseCreated
    API->>BC: 6. escrow::create (lock SUI)
    BC-->>API: Escrow created<br/>Event: EscrowCreated
    API->>DB: 7. Insert PurchaseRequest<br/>(status: pending)
    API->>DB: 8. Insert EscrowTransaction<br/>(status: holding)
    API->>Q: 9. Queue fulfillment job
    
    Note over Q: Background Processing
    Q->>W: 10-11. Fetch & re-encrypt file
    W-->>Q: Encrypted file
    Q->>W: 12. Upload re-encrypted file
    W-->>Q: Returns encrypted_blob_id
    Q->>DB: 13. Update PurchaseRequest<br/>(encryptedBlobId, status: completed)
    Q->>BC: 14. purchase::complete
    BC-->>Q: Event: PurchaseCompleted
    Q->>BC: 15. escrow::release
    BC-->>Q: Transfer SUI to seller<br/>Event: EscrowReleased
    Q->>DB: 16. Update EscrowTransaction<br/>(status: released)
    Q->>DB: 17. Update DataPod<br/>(totalSales++)
    Q->>WS: 18. Notify buyer
    WS-->>B: purchase.completed<br/>Ready to download
```

**Key Steps:**
1. Purchase validation and creation
2. Escrow creation (locks buyer's funds)
3. Background job for data re-encryption
4. Re-encryption with buyer's public key
5. On-chain purchase completion
6. Escrow release to seller
7. Database updates and notifications

---

#### 3. Data Download Flow

```mermaid
sequenceDiagram
    participant B as Buyer
    participant API as Backend API
    participant DB as PostgreSQL
    participant W as Walrus Storage
    
    B->>API: 1. GET /api/buyer/download/:purchaseId<br/>Authorization: Bearer JWT
    Note over API: 2. Verify JWT & extract userId<br/>3. Validate purchase ownership<br/>4. Check status === completed
    API->>DB: 5. Fetch encryptedBlobId<br/>& decryptionKey
    DB-->>API: Purchase data
    API->>W: 6. Fetch encrypted file by blob_id
    W-->>API: Encrypted file buffer
    API->>B: 7. Stream file with headers<br/>Content-Disposition: attachment<br/>X-Decryption-Key: encrypted_key
    Note over B: 8. Decrypt file client-side<br/>- Decrypt encryption key with private key<br/>- Decrypt file with decrypted key
    B->>B: Original Data
```

**Key Steps:**
1. Authentication and authorization
2. Purchase validation
3. Fetch encrypted file from Walrus
4. Stream to buyer with decryption key
5. Client-side decryption

---

#### 4. Review Submission Flow

```mermaid
sequenceDiagram
    participant B as Buyer
    participant API as Backend API
    participant DB as PostgreSQL
    participant WS as WebSocket
    
    B->>API: 1. POST /api/review<br/>(purchaseRequestId, rating, comment)
    Note over API: 2. Validate:<br/>- Purchase exists & completed<br/>- Buyer owns purchase<br/>- No existing review<br/>- Rating in range 1-5
    API->>DB: 3. Insert Review<br/>(datapodId, rating, comment)
    DB-->>API: Review created
    API->>DB: 4. Recalculate DataPod averageRating<br/>AVG(rating) FROM reviews
    API->>DB: 5. Recalculate Seller averageRating<br/>Average across all seller's datapods
    API->>WS: 6. Broadcast event<br/>(review.created)
    WS-->>B: SUCCESS
    WS-->>API: Notify seller & update marketplace
```

**Key Steps:**
1. Review validation
2. Review insertion
3. Aggregate rating calculations
4. Seller rating update
5. Real-time notifications

---

**Key Steps:**
1. Continuous polling of blockchain events
2. Event parsing and data extraction
3. Database synchronization
4. Checkpoint tracking
5. Real-time WebSocket broadcasts

---

## 🔁 Smart Contract Flows

### Smart Contract Technical Flows

#### 1. DataPod Creation & Publishing Flow

```move
// Step 1: Create DataPod (Draft)
┌─────────────────────────────────────────────────────┐
│ sourcenet::datapod::create_datapod()                 │
└────┬────────────────────────────────────────────────┘
     │
     │ Inputs:
     │  - datapod_id: String
     │  - title: String
     │  - category: String
     │  - description: String
     │  - price_sui: u64
     │  - data_hash: String
     │  - blob_id: String (Walrus)
     │  - ctx: &mut TxContext
     │
     ▼
   Validations:
     │  - assert!(price_sui > 0)
     │
     ▼
   Create Objects:
     ├─ DataPod {
     │    id: new_uid(),
     │    seller: tx_sender(),
     │    status: 0, // draft
     │    ...
     │  }
     │
     └─ DataPodOwnerCap {
          id: new_uid(),
          datapod_id: datapod_address
        }
     │
     ▼
   Emit Event:
     │  - DataPodCreated {
     │      datapod_id,
     │      seller,
     │      title,
     │      category,
     │      price_sui
     │    }
     │
     ▼
   Transfer:
     │  - transfer::transfer(datapod, sender)
     │  - transfer::transfer(cap, sender)
     │
     ▼
   RESULT: DataPod created in DRAFT status

// Step 2: Publish DataPod
┌─────────────────────────────────────────────────────┐
│ sourcenet::datapod::publish_datapod()                │
└────┬────────────────────────────────────────────────┘
     │
     │ Inputs:
     │  - datapod: &mut DataPod
     │  - kiosk_id: String
     │  - cap: &DataPodOwnerCap
     │  - ctx: &mut TxContext
     │
     ▼
   Validations:
     │  - assert!(datapod.status == 0 || datapod.status == 2)
     │  - assert!(cap.datapod_id == datapod.id)
     │
     ▼
   Update DataPod:
     │  - datapod.status = 1 // published
     │  - datapod.kiosk_id = kiosk_id
     │  - datapod.published_at = tx_epoch()
     │
     ▼
   Emit Event:
     │  - DataPodPublished {
     │      datapod_id,
     │      seller,
     │      title,
     │      category,
     │      price_sui,
     │      kiosk_id
     │    }
     │
     ▼
   RESULT: DataPod is now PUBLISHED in marketplace
```

---

#### 2. Purchase & Escrow Flow

```move
// Step 1: Create Purchase Request
┌─────────────────────────────────────────────────────┐
│ sourcenet::purchase::create_purchase()               │
└────┬────────────────────────────────────────────────┘
     │
     │ Inputs:
     │  - purchase_id: String
     │  - datapod_id: String
     │  - buyer: address
     │  - seller: address
     │  - buyer_public_key: String
     │  - price_sui: u64
     │  - data_hash: String
     │  - ctx: &mut TxContext
     │
     ▼
   Validations:
     │  - assert!(price_sui > 0)
     │
     ▼
   Create Objects:
     ├─ PurchaseRequest {
     │    id: new_uid(),
     │    buyer,
     │    seller,
     │    status: 0, // pending
     │    ...
     │  }
     │
     └─ PurchaseOwnerCap {
          id: new_uid(),
          purchase_id: purchase_address
        }
     │
     ▼
   Emit Event:
     │  - PurchaseCreated {
     │      purchase_id,
     │      datapod_id,
     │      buyer,
     │      seller,
     │      price_sui
     │    }
     │
     ▼
   Return:
     │  - (PurchaseRequest, PurchaseOwnerCap)
     │
     ▼
   RESULT: Purchase request created

// Step 2: Create Escrow (Lock Funds)
┌─────────────────────────────────────────────────────┐
│ sourcenet::escrow::create_escrow()                   │
└────┬────────────────────────────────────────────────┘
     │
     │ Inputs:
     │  - purchase_id: String
     │  - buyer: address
     │  - seller: address
     │  - data_hash: String
     │  - coin: Coin<SUI> // buyer's payment
     │  - ctx: &mut TxContext
     │
     ▼
   Validations:
     │  - let amount = coin::value(&coin)
     │  - assert!(amount > 0)
     │
     ▼
   Convert Coin to Balance:
     │  - let balance = coin::into_balance(coin)
     │
     ▼
   Create Objects:
     ├─ Escrow {
     │    id: new_uid(),
     │    buyer,
     │    seller,
     │    amount,
     │    status: 0, // pending
     │    balance, // FUNDS LOCKED HERE
     │    ...
     │  }
     │
     └─ EscrowOwnerCap {
          id: new_uid(),
          escrow_id: escrow_address
        }
     │
     ▼
   Emit Event:
     │  - EscrowCreated {
     │      escrow_id,
     │      purchase_id,
     │      buyer,
     │      seller,
     │      amount
     │    }
     │
     ▼
   Return:
     │  - (Escrow, EscrowOwnerCap)
     │
     ▼
   RESULT: Funds LOCKED in escrow

// Step 3: Complete Purchase
┌─────────────────────────────────────────────────────┐
│ sourcenet::purchase::complete_purchase()             │
└────┬────────────────────────────────────────────────┘
     │
     │ Inputs:
     │  - purchase: &mut PurchaseRequest
     │  - cap: &PurchaseOwnerCap
     │  - ctx: &mut TxContext
     │
     ▼
   Validations:
     │  - assert!(purchase.status == 0) // pending
     │  - assert!(cap.purchase_id == purchase.id)
     │
     ▼
   Update Purchase:
     │  - purchase.status = 1 // completed
     │  - purchase.completed_at = tx_epoch()
     │
     ▼
   Emit Event:
     │  - PurchaseCompleted {
     │      purchase_id,
     │      buyer,
     │      seller,
     │      price_sui
     │    }
     │
     ▼
   RESULT: Purchase marked as completed

// Step 4: Release Escrow (Pay Seller)
┌─────────────────────────────────────────────────────┐
│ sourcenet::escrow::release_escrow()                  │
└────┬────────────────────────────────────────────────┘
     │
     │ Inputs:
     │  - escrow: &mut Escrow
     │  - seller_address: address
     │  - ctx: &mut TxContext
     │
     ▼
   Validations:
     │  - assert!(escrow.status == 0) // pending
     │
     ▼
   Update Escrow:
     │  - escrow.status = 1 // released
     │
     ▼
   Transfer Funds:
     │  - let amount = escrow.amount
     │  - let coin = coin::from_balance(
     │        balance::split(&mut escrow.balance, amount),
     │        ctx
     │    )
     │  - transfer::public_transfer(coin, seller_address)
     │
     ▼
   Emit Event:
     │  - EscrowReleased {
     │      escrow_id,
     │      seller,
     │      amount
     │    }
     │
     ▼
   RESULT: Funds transferred to seller
```

**Critical Security Points:**
1. **Escrow Holding**: Funds are locked in `Escrow.balance` until release/refund
2. **Capability Verification**: All mutations require ownership capability proof
3. **Status Checks**: Prevents double-spending and invalid state transitions
4. **Atomic Operations**: All operations are atomic (succeed or fail completely)

---

#### 3. Refund Flow (Dispute/Cancellation)

```move
// Refund Purchase
┌─────────────────────────────────────────────────────┐
│ sourcenet::purchase::refund_purchase()               │
└────┬────────────────────────────────────────────────┘
     │
     │ Inputs:
     │  - purchase: &mut PurchaseRequest
     │  - cap: &PurchaseOwnerCap
     │
     ▼
   Validations:
     │  - assert!(purchase.status == 0) // must be pending
     │  - assert!(cap.purchase_id == purchase.id)
     │
     ▼
   Update Purchase:
     │  - purchase.status = 2 // refunded
     │
     ▼
   Emit Event:
     │  - PurchaseRefunded {
     │      purchase_id,
     │      buyer,
     │      price_sui
     │    }
     │
     ▼
   RESULT: Purchase marked as refunded

// Refund Escrow
┌─────────────────────────────────────────────────────┐
│ sourcenet::escrow::refund_escrow()                   │
└────┬────────────────────────────────────────────────┘
     │
     │ Inputs:
     │  - escrow: &mut Escrow
     │  - buyer_address: address
     │  - ctx: &mut TxContext
     │
     ▼
   Validations:
     │  - assert!(escrow.status == 0) // pending
     │
     ▼
   Update Escrow:
     │  - escrow.status = 2 // refunded
     │
     ▼
   Transfer Funds BACK to Buyer:
     │  - let amount = escrow.amount
     │  - let coin = coin::from_balance(
     │        balance::split(&mut escrow.balance, amount),
     │        ctx
     │    )
     │  - transfer::public_transfer(coin, buyer_address)
     │
     ▼
   Emit Event:
     │  - EscrowRefunded {
     │      escrow_id,
     │      buyer,
     │      amount
     │    }
     │
     ▼
   RESULT: Funds returned to buyer
```

---

#### 4. Complete Transaction Flow (Backend + Smart Contract)

```mermaid
sequenceDiagram
    participant B as Buyer
    participant API as Backend
    participant BC as Blockchain
    participant W as Walrus
    
    B->>API: 1. POST /purchase
    API->>BC: 2. create_purchase()
    BC-->>API: 3. PurchaseRequest created
    API->>BC: 4. create_escrow(coin)
    BC-->>API: 5. Escrow created<br/>Funds LOCKED
    API-->>B: 6. Purchase created
    
    Note over API: 7. Queue job (BullMQ)
    
    API->>W: 8. Fetch encrypted file
    W-->>API: 9. Encrypted data
    Note over API: 10. Re-encrypt with<br/>buyer public key
    API->>W: 11. Upload re-encrypted
    W-->>API: 12. Return blob_id
    
    API->>BC: 13. complete_purchase()
    BC-->>API: 14. Purchase status = completed
    API->>BC: 15. release_escrow()
    BC-->>API: 16. Transfer SUI to seller
    
    API-->>B: 17. WebSocket notify
    
    B->>API: 18. GET /download
    API->>W: 19. Fetch encrypted file
    W-->>API: 20. Stream file
    API-->>B: 21. File + decrypt key
    Note over B: 22. Decrypt on client
    
    B->>B: SUCCESS
    API->>API: SUCCESS
    BC->>BC: SUCCESS
    W->>W: SUCCESS
```

**Transaction Stages:**
1. **Request** - Buyer initiates purchase
2. **Lock** - Funds locked in escrow on-chain
3. **Process** - Background job re-encrypts data
4. **Complete** - On-chain completion marker
5. **Release** - Funds transferred to seller
6. **Deliver** - Buyer downloads encrypted data
7. **Decrypt** - Client-side decryption



## 🛠️ Tech Stack

### Backend Technologies

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Runtime** | Node.js | 18+ | JavaScript runtime |
| **Language** | TypeScript | 5.3+ | Type-safe development |
| **Framework** | Express.js | 4.18+ | Web framework |
| **Database** | PostgreSQL | 15+ | Primary database |
| **ORM** | Prisma | 5.4+ | Database toolkit |
| **Cache** | Redis | 7+ | Caching & sessions |
| **Queue** | BullMQ | 4.10+ | Job processing |
| **Blockchain** | @mysten/sui | 1.9+ | Sui SDK |
| **Storage** | Walrus | 0.3+ | Decentralized storage |
| **WebSocket** | ws | 8.14+ | Real-time communication |
| **Validation** | Zod | 3.22+ | Schema validation |
| **Crypto** | TweetNaCl, libsodium | - | Encryption |
| **Security** | Helmet, CORS | - | HTTP security |
| **Logging** | Winston | 3.11+ | Application logging |
| **Testing** | Jest | 29.5+ | Unit testing |

---

## ⚙️ Prerequisites

Before you begin, ensure you have installed:

- **Node.js** v18.0.0 or higher
- **npm** v9.0.0 or higher
- **Docker** and **Docker Compose** (for local services)
- **PostgreSQL Client** (optional, for debugging)
- **Sui CLI** (for smart contract deployment)

---

## 📦 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd sourcenet-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Infrastructure Services

Using Docker Compose to start PostgreSQL and Redis:

```bash
npm run docker:up
# OR
docker-compose up -d
```

Verify services are running:
```bash
docker ps
```

### 4. Configure Environment

Copy the example environment file and update values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see Environment Variables section).

### 5. Initialize Database

```bash
# Push Prisma schema to database
npm run db:push

# Run migrations (if any)
npm run db:migrate

# (Optional) Seed initial data
npm run db:seed
```

### 6. Start the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

The server will start on `http://localhost:3001`.

---

## 🔐 Environment Variables

### Complete Environment Configuration

Create a `.env` file in the root directory:

#### **Server Configuration**
```env
NODE_ENV=development                    # development | staging | production
PORT=3001                                # API server port
API_BASE_URL=http://localhost:3001      # Public API URL
API_NAME=SourceNet Backend
API_VERSION=1.0.0
CORS_ORIGINS=http://localhost:3000,http://localhost:3001  # Comma-separated allowed origins
```

#### **Database Configuration**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/sourcenet?schema=public
DATABASE_DIRECT_URL=postgresql://user:password@localhost:5432/sourcenet
DATABASE_POOL_MAX=20
DATABASE_POOL_MIN=2
```

#### **Redis Configuration**
```env
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=                     # Leave empty if no password
REDIS_DB=0
```

#### **Sui Blockchain Configuration**
```env
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SUI_NETWORK=testnet                 # testnet | mainnet | devnet
SUI_SPONSOR_ADDRESS=0x...           # Your sponsor wallet address
SUI_SPONSOR_PRIVATE_KEY=           # Private key for gas sponsorship
SOURCENET_PACKAGE_ID=0x...         # Deployed smart contract package ID
```

#### **Walrus Storage Configuration**
```env
WALRUS_API_URL=https://walrus-testnet.mystenlabs.com
WALRUS_BLOB_ENDPOINT=https://blobstore.walrus-testnet.mystenlabs.com
```

#### **WebSocket Configuration**
```env
WS_PORT=3002
WS_URL=ws://localhost:3002
```

#### **Authentication & Security**
```env
JWT_SECRET=your-super-secret-jwt-key-min-32-chars  # CHANGE THIS!
JWT_EXPIRY=7d
ZKLOGIN_CLIENT_ID=your-google-oauth-client-id
ZKLOGIN_REDIRECT_URI=http://localhost:3000/auth/callback
```

#### **AI Integration (Optional)**
```env
OPENAI_API_KEY=...
OPENAI_MODEL=...
OPENAI_BASE_URL=...
```

#### **Logging & Monitoring**
```env
LOG_LEVEL=info                      # debug | info | warn | error
SENTRY_DSN=https://...              # Optional: Sentry error tracking
```

---

## 🚀 Running the Application

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Development** | `npm run dev` | Start with hot-reload |
| **Production** | `npm start` | Run compiled code |
| **Build** | `npm run build` | Compile TypeScript |
| **Database Push** | `npm run db:push` | Push schema to DB |
| **Database Migrate** | `npm run db:migrate` | Run migrations |
| **Database Seed** | `npm run db:seed` | Seed initial data |
| **Database Reset** | `npm run db:reset` | Reset database |
| **Test** | `npm test` | Run Jest tests |
| **Lint** | `npm run lint` | Check code quality |
| **Format** | `npm run format` | Format with Prettier |
| **Docker Up** | `npm run docker:up` | Start Docker services |
| **Docker Down** | `npm run docker:down` | Stop Docker services |

### Development Workflow

```bash
# 1. Start infrastructure
npm run docker:up

# 2. Start backend server (Terminal 1)
npm run dev

# 3. View logs
tail -f logs/combined.log
```

---

## 📊 Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ DataPod : "creates"
    User ||--o{ PurchaseRequest : "makes"
    User ||--o{ Review : "writes"
    User ||--o{ UploadStaging : "uploads"
    User ||--o{ EscrowTransaction : "participates"
    User ||--o{ AiConversation : "has"
    
    DataPod ||--o{ PurchaseRequest : "purchased via"
    DataPod ||--o{ Review : "receives"
    DataPod ||--|| UploadStaging : "staged from"
    
    PurchaseRequest ||--|| EscrowTransaction : "has"
    PurchaseRequest ||--|| Review : "reviewed by"
    
    User {
        uuid id PK
        string zkloginAddress UK
        string walletAddress UK
        string googleEmail UK
        string username
        string bio
        string avatarUrl
        int totalSales
        decimal totalRevenue
        decimal averageRating
        int reputationScore
        boolean isVerified
        datetime createdAt
        datetime updatedAt
    }
    
    DataPod {
        uuid id PK
        string datapodId
        uuid sellerId FK
        string title
        text description
        string category
        array tags
        decimal priceSui
        string dataHash UK
        int totalSales
        decimal averageRating
        string status
        string blobId
        string kioskId
        datetime publishedAt
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }
    
    PurchaseRequest {
        uuid id PK
        string purchaseRequestId
        uuid datapodId FK
        uuid buyerId FK
        string buyerAddress
        string sellerAddress
        string buyerPublicKey
        decimal priceSui
        string status
        string encryptedBlobId
        string decryptionKey
        string txDigest
        datetime completedAt
        datetime createdAt
        datetime updatedAt
    }
    
    Review {
        uuid id PK
        uuid datapodId FK
        uuid purchaseRequestId FK_UK
        uuid buyerId FK
        string buyerAddress
        int rating
        text comment
        datetime createdAt
    }
    
    EscrowTransaction {
        uuid id PK
        uuid purchaseRequestId FK_UK
        uuid sellerId FK
        string sellerAddress
        string buyerAddress
        decimal amountSui
        string escrowObjectId
        string status
        string txDigest
        datetime releasedAt
        datetime createdAt
        datetime updatedAt
    }
```

### Core Models

#### **User**
Stores user profiles for both buyers and sellers.

```typescript
{
  id: UUID,
  zkloginAddress: String (unique),
  walletAddress: String (unique),
  googleEmail: String (unique),
  username: String,
  bio: String,
  avatarUrl: String,
  totalSales: Integer,
  totalRevenue: Decimal,
  averageRating: Decimal,
  reputationScore: Integer,
  isVerified: Boolean,
  createdAt: DateTime,
  updatedAt: DateTime
}
```

#### **DataPod**
Represents a data listing in the marketplace.

```typescript
{
  id: UUID,
  datapodId: String (on-chain ID),
  sellerId: UUID,
  title: String,
  description: Text,
  category: String,
  tags: String[],
  priceSui: Decimal,
  dataHash: String (unique),
  totalSales: Integer,
  averageRating: Decimal,
  status: String (draft|published|delisted),
  blobId: String (Walrus ID),
  kioskId: String (Sui Kiosk ID),
  publishedAt: DateTime,
  createdAt: DateTime,
  updatedAt: DateTime,
  deletedAt: DateTime (soft delete)
}
```

#### **PurchaseRequest**
Tracks purchase transactions.

```typescript
{
  id: UUID,
  purchaseRequestId: String (on-chain ID),
  datapodId: UUID,
  buyerId: UUID,
  buyerAddress: String,
  sellerAddress: String,
  buyerPublicKey: String (for encryption),
  priceSui: Decimal,
  status: String (pending|completed|refunded|disputed),
  encryptedBlobId: String,
  decryptionKey: String (encrypted),
  txDigest: String,
  completedAt: DateTime,
  createdAt: DateTime,
  updatedAt: DateTime
}
```

#### **Review**
User ratings for completed purchases.

```typescript
{
  id: UUID,
  datapodId: UUID,
  purchaseRequestId: UUID (unique),
  buyerId: UUID,
  buyerAddress: String,
  rating: Integer (1-5),
  comment: Text,
  createdAt: DateTime
}
```

#### **EscrowTransaction**
Payment escrow tracking.

```typescript
{
  id: UUID,
  purchaseRequestId: UUID (unique),
  sellerId: UUID,
  sellerAddress: String,
  buyerAddress: String,
  amountSui: Decimal,
  escrowObjectId: String (Sui object ID),
  status: String (holding|released|refunded),
  txDigest: String,
  releasedAt: DateTime,
  createdAt: DateTime,
  updatedAt: DateTime
}
```

---

## 🔌 API Endpoints

### Base URL
```
http://localhost:3001/api
```

### API Documentation
Swagger UI: `http://localhost:3001/api-docs`

### Endpoint Overview

#### **Authentication (`/api/auth`)**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/auth/zklogin` | ZK Login authentication | No |
| `POST` | `/auth/verify` | Verify JWT token | No |
| `GET` | `/auth/profile` | Get user profile | Yes |
| `PUT` | `/auth/profile` | Update user profile | Yes |

#### **Marketplace (`/api/marketplace`)**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/marketplace/datapods` | List all published datapods | No |
| `GET` | `/marketplace/datapods/:id` | Get datapod details | No |
| `GET` | `/marketplace/categories` | Get all categories | No |
| `GET` | `/marketplace/search` | Search datapods | No |

**Query Parameters for `/marketplace/datapods`:**
- `category` - Filter by category
- `minPrice` - Minimum price (SUI)
- `maxPrice` - Maximum price (SUI)
- `sortBy` - Sort field (price, createdAt, rating, sales)
- `order` - Sort order (asc, desc)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

#### **Seller (`/api/seller`)**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/seller/upload` | Upload data file | Yes |
| `POST` | `/seller/publish` | Publish datapod | Yes |
| `GET` | `/seller/datapods` | Get seller's datapods | Yes |
| `PUT` | `/seller/datapods/:id` | Update datapod | Yes |
| `DELETE` | `/seller/datapods/:id` | Delist datapod | Yes |
| `GET` | `/seller/sales` | Get sales history | Yes |
| `GET` | `/seller/analytics` | Get seller analytics | Yes |

#### **Buyer (`/api/buyer`)**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/buyer/purchase` | Initiate purchase | Yes |
| `GET` | `/buyer/purchases` | Get purchase history | Yes |
| `GET` | `/buyer/purchases/:id` | Get purchase details | Yes |
| `POST` | `/buyer/download/:purchaseId` | Download purchased data | Yes |

#### **Review (`/api/review`)**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/review` | Submit review | Yes |
| `GET` | `/review/datapod/:id` | Get datapod reviews | No |
| `GET` | `/review/my-reviews` | Get user's reviews | Yes |
| `DELETE` | `/review/:id` | Delete review | Yes |

#### **AI Chat (`/api/ai`)**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/ai/chat` | Send chat message | Yes |
| `GET` | `/ai/conversations` | List conversations | Yes |
| `GET` | `/ai/conversations/:id` | Get conversation | Yes |
| `DELETE` | `/ai/conversations/:id` | Delete conversation | Yes |

#### **Health (`/api/health`)**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/health` | Health check | No |
| `GET` | `/health/db` | Database health | No |
| `GET` | `/health/redis` | Redis health | No |
| `GET` | `/health/blockchain` | Blockchain connection | No |

---

## 🔄 WebSocket Events

Connect to: `ws://localhost:3002`

### Event Types

#### **Client → Server**

```typescript
// Subscribe to datapod updates
{
  type: 'subscribe',
  channel: 'datapod',
  id: 'datapod-uuid'
}

// Subscribe to user updates
{
  type: 'subscribe',
  channel: 'user',
  id: 'user-address'
}

// Subscribe to marketplace updates
{
  type: 'subscribe',
  channel: 'marketplace'
}
```

#### **Server → Client**

```typescript
// New datapod published
{
  type: 'datapod.published',
  data: {
    id: 'uuid',
    title: 'Dataset Title',
    category: 'finance',
    priceSui: '100',
    seller: '0x...'
  }
}

// Purchase completed
{
  type: 'purchase.completed',
  data: {
    purchaseId: 'uuid',
    datapodId: 'uuid',
    buyer: '0x...',
    status: 'completed'
  }
}

// Review submitted
{
  type: 'review.created',
  data: {
    datapodId: 'uuid',
    rating: 5,
    comment: 'Great data!'
  }
}
```

---

## 🔒 Security

### Authentication Flow

1. **ZK Login** - Zero-knowledge proof authentication via Google OAuth
2. **JWT Tokens** - Secure session management
3. **Wallet Verification** - Sui wallet signature verification

### Data Encryption

```
┌─────────────────┐
│   Seller Data   │
└────────┬────────┘
         │
         │ 1. Encrypt with random key
         ▼
  ┌──────────────┐
  │ Encrypted    │ → Upload to Walrus
  │ Data         │
  └──────────────┘
         │
         │ 2. Encrypt key with buyer's public key
         ▼
  ┌──────────────┐
  │ Encrypted    │ → Store on-chain
  │ Key          │
  └──────────────┘
         │
         │ 3. Buyer decrypts with private key
         ▼
  ┌──────────────┐
  │ Original     │
  │ Data         │
  └──────────────┘
```

### Security Best Practices

- ✅ All API endpoints use HTTPS in production
- ✅ Rate limiting on sensitive endpoints
- ✅ Input validation with Zod schemas
- ✅ SQL injection prevention via Prisma ORM
- ✅ XSS protection with Helmet.js
- ✅ CORS configured for trusted origins
- ✅ Secrets stored in environment variables
- ✅ Database credentials encrypted at rest

---

## ⛓️ Smart Contracts Overview

The SourceNet smart contracts are written in **Sui Move** and deployed on the Sui blockchain.

**Location**: `contracts/escrow/`

### Contract Architecture

```
sourcenet::datapod    - Data listing management
    │
    ├─ DataPod struct
    ├─ DataPodOwnerCap
    └─ Events (Created, Published, Delisted)

sourcenet::purchase   - Purchase transaction handling
    │
    ├─ PurchaseRequest struct
    ├─ PurchaseOwnerCap
    └─ Events (Created, Completed, Refunded, Disputed)

sourcenet::escrow     - Payment escrow management
    │
    ├─ Escrow struct
    ├─ EscrowOwnerCap
    └─ Events (Created, Released, Refunded)
```

---

## 📝 Contract Modules

### 1. DataPod Module (`datapod.move`)

Manages data listings and metadata.

#### **Structs**

```move
public struct DataPod has key, store {
    id: UID,
    datapod_id: String,
    seller: address,
    title: String,
    category: String,
    description: String,
    price_sui: u64,
    data_hash: String,
    blob_id: String,          // Walrus blob ID
    kiosk_id: String,         // Sui Kiosk ID
    status: u8,               // 0:draft, 1:published, 2:delisted
    total_sales: u64,
    average_rating: u64,      // Basis points (450 = 4.5)
    created_at: u64,
    published_at: u64,
}

public struct DataPodOwnerCap has key, store {
    id: UID,
    datapod_id: address,
}
```

#### **Functions**

##### `create_datapod`
Creates a new data listing (draft status).

```move
public fun create_datapod(
    datapod_id: String,
    title: String,
    category: String,
    description: String,
    price_sui: u64,
    data_hash: String,
    blob_id: String,
    ctx: &mut TxContext,
)
```

##### `publish_datapod`
Publishes a datapod to the marketplace.

```move
public fun publish_datapod(
    datapod: &mut DataPod,
    kiosk_id: String,
    cap: &DataPodOwnerCap,
    ctx: &mut TxContext,
)
```

##### `delist_datapod`
Removes a datapod from the marketplace.

```move
public fun delist_datapod(
    datapod: &mut DataPod,
    cap: &DataPodOwnerCap,
    ctx: &mut TxContext,
)
```

##### `update_price`
Updates the price of a datapod.

```move
public fun update_price(
    datapod: &mut DataPod,
    new_price: u64,
    cap: &DataPodOwnerCap,
)
```

#### **Events**

- `DataPodCreated` - Emitted when a datapod is created
- `DataPodPublished` - Emitted when published to marketplace
- `DataPodDelisted` - Emitted when delisted
- `DataPodPriceUpdated` - Emitted when price is updated

---

### 2. Purchase Module (`purchase.move`)

Handles purchase requests and fulfillment.

#### **Structs**

```move
public struct PurchaseRequest has key, store {
    id: UID,
    purchase_id: String,
    datapod_id: String,
    buyer: address,
    seller: address,
    buyer_public_key: String,  // For data encryption
    price_sui: u64,
    data_hash: String,
    status: u8,                // 0:pending, 1:completed, 2:refunded, 3:disputed
    created_at: u64,
    completed_at: u64,
}

public struct PurchaseOwnerCap has key, store {
    id: UID,
    purchase_id: address,
}
```

#### **Functions**

##### `create_purchase`
Initiates a new purchase request.

```move
public fun create_purchase(
    purchase_id: String,
    datapod_id: String,
    buyer: address,
    seller: address,
    buyer_public_key: String,
    price_sui: u64,
    data_hash: String,
    ctx: &mut TxContext,
): (PurchaseRequest, PurchaseOwnerCap)
```

##### `complete_purchase`
Marks a purchase as completed after seller fulfillment.

```move
public fun complete_purchase(
    purchase: &mut PurchaseRequest,
    cap: &PurchaseOwnerCap,
    ctx: &mut TxContext,
)
```

##### `refund_purchase`
Refunds a purchase to the buyer.

```move
public fun refund_purchase(
    purchase: &mut PurchaseRequest,
    cap: &PurchaseOwnerCap,
)
```

##### `dispute_purchase`
Opens a dispute for a purchase.

```move
public fun dispute_purchase(
    purchase: &mut PurchaseRequest,
    ctx: &mut TxContext,
)
```

#### **Events**

- `PurchaseCreated` - Emitted when purchase is initiated
- `PurchaseCompleted` - Emitted when seller fulfills
- `PurchaseRefunded` - Emitted when refunded to buyer
- `PurchaseDisputed` - Emitted when disputed

---

### 3. Escrow Module (`escrow.move`)

Manages payment escrow between buyers and sellers.

#### **Structs**

```move
public struct Escrow has key, store {
    id: UID,
    purchase_id: String,
    buyer: address,
    seller: address,
    amount: u64,
    data_hash: String,
    status: u8,              // 0:pending, 1:released, 2:refunded
    created_at: u64,
    balance: Balance<SUI>,   // Holds the funds
}

public struct EscrowOwnerCap has key, store {
    id: UID,
    escrow_id: address,
}
```

#### **Functions**

##### `create_escrow`
Creates a new escrow and locks funds.

```move
public fun create_escrow(
    purchase_id: String,
    buyer: address,
    seller: address,
    data_hash: String,
    coin: Coin<SUI>,
    ctx: &mut TxContext,
): (Escrow, EscrowOwnerCap)
```

##### `release_escrow`
Releases funds to the seller.

```move
public fun release_escrow(
    escrow: &mut Escrow,
    seller_address: address,
    ctx: &mut TxContext,
)
```

##### `refund_escrow`
Refunds funds to the buyer.

```move
public fun refund_escrow(
    escrow: &mut Escrow,
    buyer_address: address,
    ctx: &mut TxContext,
)
```

#### **Events**

- `EscrowCreated` - Emitted when escrow is created
- `EscrowReleased` - Emitted when funds released to seller
- `EscrowRefunded` - Emitted when funds refunded to buyer

---

## 🏗️ Bui & Testing

### Prerequisites

Install the Sui CLI:

```bash
# macOS
brew install sui

# Linux
cargo install --locked --git https://github.com/MystenLabs/sui.git --branch devnet sui
```

Verify installation:
```bash
sui --version
```

### Build Smart Contracts

```bash
cd contracts/escrow
sui move build
```

Expected output:
```
BUILDING sourcenet_escrow
Build successful
```

### Run Tests

```bash
sui move test
```

Expected output:
```
Running Move unit tests
[ PASS    ] 0x0::datapod::test_create_datapod
[ PASS    ] 0x0::purchase::test_create_purchase
[ PASS    ] 0x0::escrow::test_create_escrow
Test result: OK. Total tests: 3; passed: 3; failed: 0
```

---

## 🚢 Deployment

### 1. Configure Sui Client

```bash
# Set active environment
sui client active-env testnet

# Verify active address
sui client active-address

# Check gas balance
sui client gas
```

### 2. Publish Contract

```bash
cd contracts/escrow
sui client publish --gas-budget 100000000
```

### 3. Save Package ID

After successful deployment, note the **Package ID** from the output:

```
Published Package ID: 0xabcd1234...
```

### 4. Update Backend Configuration

Update `.env`:

```env
SOURCENET_PACKAGE_ID=0xabcd1234...
```

### 5. Verify Deployment

```bash
sui client object <PACKAGE_ID>
```

---

## 🧪 Testing

### Backend Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- src/controllers/auth.controller.test.ts

# Watch mode
npm test -- --watch
```

### Smart Contract Tests

```bash
cd contracts/escrow
sui move test

# Verbose output
sui move test --verbose

# Specific test
sui move test --filter test_create_datapod
```

---

## 📝 Contributing

We welcome contributions! Please follow these guidelines:

### Development Process

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Install** dependencies (`npm install`)
4. **Make** your changes
5. **Test** thoroughly (`npm test`)
6. **Lint** your code (`npm run lint`)
7. **Format** with Prettier (`npm run format`)
8. **Commit** with clear messages (`git commit -m 'Add amazing feature'`)
9. **Push** to your branch (`git push origin feature/amazing-feature`)
10. **Open** a Pull Request

### Code Standards

- ✅ TypeScript with strict mode enabled
- ✅ No `any` types allowed
- ✅ Explicit return types for functions
- ✅ Comprehensive unit tests (>80% coverage)
- ✅ Meaningful variable and function names
- ✅ JSDoc comments for public APIs
- ✅ Follow existing code structure

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Example**:
```
feat(marketplace): add category filtering to datapods endpoint

- Added query parameter for category
- Updated Swagger documentation
- Added unit tests

Closes #123
```

---

## 📄 License

This project is licensed under the **MIT License**.

```
MIT License

Copyright (c) 2025 SourceNet

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

---

## 🆘 Support

For questions or issues:

- 📧 Email: husseinrian@gmail.com

---

**Built with ❤️ by the SourceNet Team**
