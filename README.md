# SourceNet Backend

Decentralized Data Marketplace Backend - Powered by Sui Blockchain

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.3+
- **Framework**: Express.js 4.18+
- **Database**: PostgreSQL 15 (with Prisma ORM)
- **Cache**: Redis 7
- **Job Queue**: BullMQ
- **Blockchain**: Sui Network
- **Storage**: AWS S3 + Walrus Protocol
- **Real-time**: WebSocket (ws)
- **Validation**: Zod
- **Security**: Helmet, CORS, Rate Limiting
- **Logging**: Winston + Morgan
- **Testing**: Jest + ts-jest
- **Linting**: ESLint + Prettier
- **Cryptography**: TweetNaCl, libsodium, @noble/hashes

## Project Structure

```
src/
├── config/           - Configuration setup (env, database, redis, etc.)
├── middleware/       - Express middleware (auth, error handling, logging)
├── routes/           - API route definitions
├── controllers/      - Request handlers and business logic orchestration
├── services/         - Core business logic and external service integration
├── jobs/             - Background job definitions (BullMQ)
├── websocket/        - WebSocket handlers for real-time updates
├── types/            - TypeScript interfaces and types
├── utils/            - Utility functions and helpers
├── indexer/          - Blockchain event indexer and syncer
└── main.ts           - Application entry point

Root Configuration Files:
├── tsconfig.json     - TypeScript compiler configuration
├── eslint.config.json - ESLint rules and configuration
├── prettier.config.json - Code formatting rules
├── docker-compose.yml - Local development services
├── .env.example      - Environment variables template
└── package.json      - Project dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker & Docker Compose (optional)
- PostgreSQL 15 (or use Docker)
- Redis 7 (or use Docker)

### Installation

1. **Clone repository**
```bash
git clone https://github.com/yourusername/sourcenet-backend.git
cd sourcenet-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env.local
# Edit .env.local with your configuration values
```

4. **Start Docker services** (PostgreSQL, Redis, LocalStack S3)
```bash
npm run docker:up
# or
docker-compose up -d
```

5. **Setup database**
```bash
npm run db:push        # Push schema to database
npm run db:migrate     # Run migrations
```

6. **Start development server**
```bash
npm run dev
```

Server running at: `http://localhost:3001`
WebSocket running at: `ws://localhost:3002`

## Available Scripts

### Development
- `npm run dev` - Start development server with hot reload
- `npm run indexer:dev` - Start blockchain indexer service

### Building & Running
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run production build

### Code Quality
- `npm run lint` - Run ESLint to check code quality
- `npm run format` - Format code with Prettier
- `npm test` - Run test suite with Jest

### Database
- `npm run db:push` - Push Prisma schema to database
- `npm run db:migrate` - Create and run database migrations
- `npm run db:seed` - Seed database with initial data

### Docker
- `npm run docker:up` - Start all Docker services
- `npm run docker:down` - Stop all Docker services

## Environment Variables

See `.env.example` for all available variables. Key sections:

### Server Configuration
- `NODE_ENV` - Environment (development/staging/production)
- `PORT` - API server port (default: 3001)
- `API_BASE_URL` - Public API URL

### Database & Cache
- `DATABASE_URL` - PostgreSQL connection string
- `DATABASE_POOL_MAX` - Connection pool size
- `REDIS_URL` - Redis connection URL

### Blockchain (Sui)
- `SUI_RPC_URL` - Sui blockchain RPC endpoint
- `SUI_NETWORK` - Network (testnet/mainnet)
- `SUI_SPONSOR_ADDRESS` - Sponsor address for transactions
- `SUI_SPONSOR_PRIVATE_KEY` - Sponsor private key
- `SOURCENET_PACKAGE_ID` - SourceNet smart contract package ID

### Storage
- `AWS_REGION` - AWS region for S3
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `S3_BUCKET_NAME` - S3 bucket name
- `S3_ENDPOINT` - S3 endpoint (for LocalStack: http://localhost:4566)
- `WALRUS_API_URL` - Walrus API endpoint
- `WALRUS_BLOB_ENDPOINT` - Walrus blob storage endpoint

### Security & Authentication
- `JWT_SECRET` - JWT signing secret (change in production)
- `JWT_EXPIRY` - JWT token expiry time
- `ZKLOGIN_CLIENT_ID` - ZKLogin OAuth client ID
- `ZKLOGIN_REDIRECT_URI` - ZKLogin redirect URI

### WebSocket
- `WS_PORT` - WebSocket server port (default: 3002)
- `WS_URL` - Public WebSocket URL

### Logging & Monitoring
- `LOG_LEVEL` - Logging level (debug/info/warn/error)
- `SENTRY_DSN` - Sentry error tracking DSN

## API Documentation

See `docs/API.md` for complete API documentation.

## Architecture

### Seller Flow
1. Upload data → 2. Sign & publish → 3. Data listed on blockchain → 4. Appears in marketplace

### Buyer Flow
1. Browse marketplace → 2. Purchase → 3. Payment locked in escrow → 4. Seller fulfills → 5. Download & decrypt

### Indexer Flow
1. Poll blockchain → 2. Parse events → 3. Store in DB → 4. Broadcast to FE via WebSocket

## Security

### Encryption
- Hybrid encryption: X25519 key exchange + AES-256-GCM for data
- All sensitive data encrypted at rest

### Authentication & Authorization
- JWT token-based authentication
- ZKLogin integration for zero-knowledge proofs
- Signature verification for blockchain transactions
- Role-based access control (RBAC)

### API Security
- Rate limiting on sensitive endpoints
- CORS protection
- Helmet.js for HTTP headers
- Input validation with Zod
- CSRF protection

### Secrets Management
- All secrets in environment variables
- Never commit `.env` files
- Use `.env.example` as template
- Rotate secrets regularly in production

## Deployment

### Docker

```bash
# Build Docker image
docker build -f docker/Dockerfile -t sourcenet-backend:latest .

# Run container
docker run -p 3001:3001 -p 3002:3002 --env-file .env sourcenet-backend:latest
```

### Docker Compose (Production)

```bash
# Build and start all services
docker-compose -f docker-compose.yml up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Environment-Specific Configuration

- **Development**: Use `.env.local` with LocalStack S3
- **Staging**: Use `.env.staging` with AWS S3 test bucket
- **Production**: Use `.env.production` with secure secrets management (e.g., AWS Secrets Manager)

### Kubernetes

See `k8s/` directory for Kubernetes manifests and deployment guides.

## Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/AmazingFeature`
3. Install dependencies: `npm install`
4. Make changes and ensure code quality:
   ```bash
   npm run lint
   npm run format
   npm test
   ```
5. Commit changes: `git commit -m 'Add AmazingFeature'`
6. Push to branch: `git push origin feature/AmazingFeature`
7. Open Pull Request

### Code Standards

- TypeScript with strict mode enabled
- ESLint rules enforced (no `any` types, explicit return types)
- Prettier formatting required
- All tests must pass
- Meaningful commit messages

## License

This project is licensed under the MIT License.

## Support

For support, email support@sourcenet.io or open an issue on GitHub.
