
# ============================================
# Create root level configuration files
# ============================================

echo -e "${YELLOW}📝 Creating root configuration files...${NC}"

# .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
*.log
.env
.env.local
.env.*.local
coverage/
.DS_Store
.idea/
.vscode/
*.swp
*.swo
*~
logs/
EOF

# .env.example
cat > .env.example << 'EOF'
# ============================================
# SERVER CONFIGURATION
# ============================================
NODE_ENV=development
PORT=3001
API_BASE_URL=http://localhost:3001
API_NAME=SourceNet Backend
API_VERSION=1.0.0

# ============================================
# DATABASE (PostgreSQL)
# ============================================
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sourcenet
DATABASE_POOL_MAX=20
DATABASE_POOL_MIN=2

# ============================================
# REDIS (Caching & Job Queue)
# ============================================
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# ============================================
# BLOCKCHAIN (Sui)
# ============================================
SUI_RPC_URL=https://fullnode.testnet.sui.io
SUI_NETWORK=testnet
SUI_SPONSOR_ADDRESS=0x
SUI_SPONSOR_PRIVATE_KEY=0x
SOURCENET_PACKAGE_ID=0x

# ============================================
# WALRUS STORAGE
# ============================================
WALRUS_API_URL=https://api.testnet.walrus.io
WALRUS_BLOB_ENDPOINT=https://blobs.testnet.walrus.io

# ============================================
# AWS S3 (File Storage)
# ============================================
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=sourcenet-uploads-dev

# ============================================
# WEBSOCKET
# ============================================
WS_PORT=3002
WS_URL=ws://localhost:3002

# ============================================
# SECURITY & JWT
# ============================================
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRY=7d

# ============================================
# ZKLOGIN (Google OAuth)
# ============================================
ZKLOGIN_CLIENT_ID=
ZKLOGIN_REDIRECT_URI=http://localhost:3000/auth/callback

# ============================================
# LOGGING
# ============================================
LOG_LEVEL=info
SENTRY_DSN=
EOF

# package.json
cat > package.json << 'EOF'
{
  "name": "sourcenet-backend",
  "version": "1.0.0",
  "description": "SourceNet - Decentralized Data Marketplace Backend",
  "main": "dist/main.js",
  "type": "module",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:seed": "ts-node prisma/seed.ts",
    "db:studio": "prisma studio",
    "indexer:dev": "ts-node-dev --respawn --transpile-only src/indexer/indexer.ts",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@mysten/sui.js": "^0.47.0",
    "@prisma/client": "^5.4.0",
    "pg": "^8.11.0",
    "ioredis": "^5.3.0",
    "bullmq": "^4.10.0",
    "tweetnacl-js": "^1.0.3",
    "libsodium.js": "^0.7.11",
    "@noble/hashes": "^1.3.1",
    "@noble/curves": "^1.1.0",
    "aws-sdk": "^2.1467.0",
    "multer": "^1.4.5-lts.1",
    "zod": "^3.22.0",
    "helmet": "^7.0.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.0.0",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0",
    "morgan": "^1.10.0",
    "ws": "^8.14.0",
    "axios": "^1.5.0",
    "uuid": "^9.0.0",
    "dayjs": "^1.11.0",
    "lodash-es": "^4.17.21",
    "jsonwebtoken": "^9.1.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/express": "^4.17.17",
    "@types/node": "^20.3.0",
    "ts-node": "^10.9.0",
    "ts-node-dev": "^2.0.0",
    "prisma": "^5.4.0",
    "eslint": "^8.50.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "prettier": "^3.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
EOF

# tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"],
      "@config/*": ["config/*"],
      "@routes/*": ["routes/*"],
      "@controllers/*": ["controllers/*"],
      "@services/*": ["services/*"],
      "@utils/*": ["utils/*"],
      "@types/*": ["types/*"]
    },
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
EOF

# prettier.config.json
cat > prettier.config.json << 'EOF'
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "useTabs": false,
  "printWidth": 100,
  "arrowParens": "always",
  "bracketSpacing": true,
  "endOfLine": "lf"
}
EOF

# eslint.config.json
cat > eslint.config.json << 'EOF'
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-return-types": ["error", { "allowExpressions": true }],
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
EOF

# docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: sourcenet
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
EOF

# Dockerfile
cat > docker/Dockerfile << 'EOF'
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main.ts"]
EOF

# README.md
cat > README.md << 'EOF'
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
EOF

# ============================================
# Summary
# ============================================

echo -e "\n${GREEN}✅ Folder structure created successfully!${NC}\n"
echo -e "${GREEN}📁 Directory: $(pwd)${NC}"
echo -e "${GREEN}📊 Files created:${NC}"

# Count files
FILE_COUNT=$(find . -type f | wc -l)
DIR_COUNT=$(find . -type d | wc -l)

echo -e "${GREEN}   - Directories: ${DIR_COUNT}${NC}"
echo -e "${GREEN}   - Files: ${FILE_COUNT}${NC}"

echo -e "\n${BLUE}📝 Next steps:${NC}"
echo -e "${BLUE}1. cd sourcenet-backend${NC}"
echo -e "${BLUE}2. npm install${NC}"
echo -e "${BLUE}3. cp .env.example .env.local${NC}"
echo -e "${BLUE}4. Edit .env.local with your values${NC}"
echo -e "${BLUE}5. docker-compose up -d${NC}"
echo -e "${BLUE}6. npm run dev${NC}"

echo -e "\n${YELLOW}🎉 Ready to start building!${NC}\n"