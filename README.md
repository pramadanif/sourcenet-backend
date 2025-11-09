# SourceNet Backend

Decentralized Data Marketplace Backend - Powered by Sui Blockchain

## Tech Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Blockchain**: Sui
- **Storage**: AWS S3 + Walrus

## Project Structure

```
src/
├── config/       - Configuration setup
├── middleware/   - Express middleware
├── routes/       - API endpoints
├── controllers/  - Route handlers
├── services/     - Business logic
├── jobs/         - Background jobs (BullMQ)
├── websocket/    - Real-time updates
├── types/        - TypeScript types
├── utils/        - Utilities & helpers
└── indexer/      - Blockchain event syncing
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

3. **Setup environment**
```bash
cp .env.example .env.local
# Edit .env.local with your values
```

4. **Start services**
```bash
docker-compose up -d
```

5. **Setup database**
```bash
npm run db:migrate
npm run db:seed
```

6. **Start development server**
```bash
npm run dev
```

Server running at: `http://localhost:3001`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build TypeScript
- `npm start` - Run production build
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run format` - Format code
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database
- `npm run indexer:dev` - Start indexer service
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services

## Environment Variables

See `.env.example` for all available variables.

Key variables:
- `NODE_ENV` - Environment (development/staging/production)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection URL
- `SUI_RPC_URL` - Sui blockchain RPC endpoint
- `JWT_SECRET` - JWT signing secret
- `AWS_*` - AWS credentials for S3

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

- All data encrypted (hybrid encryption: X25519 + AES-256-GCM)
- Signature verification for all user actions
- Rate limiting on sensitive endpoints
- JWT authentication
- Environment variables for secrets

## Deployment

### Docker

```bash
docker build -t sourcenet-backend .
docker run -p 3001:3001 --env-file .env sourcenet-backend
```

### Kubernetes

See `k8s/` directory for Kubernetes manifests.

## Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/AmazingFeature`
3. Commit changes: `git commit -m 'Add AmazingFeature'`
4. Push to branch: `git push origin feature/AmazingFeature`
5. Open Pull Request

## License

This project is licensed under the MIT License.

## Support

For support, email support@sourcenet.io or open an issue on GitHub.
