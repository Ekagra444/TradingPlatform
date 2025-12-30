# Real-time Trading Platform

Event-driven cryptocurrency trading platform built with Turborepo, Next.js, and microservices architecture.

## Architecture

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS v4
- **API Gateway**: Express + JWT Authentication
- **Execution Service**: Order matching and execution
- **Event Service**: WebSocket server + Binance integration
- **Database**: PostgreSQL (Neon)
- **Cache/PubSub**: Redis Cloud
- **WebSocket**: Native WS for real-time updates

## Services

- **Frontend** (port 3000): User interface for trading
- **API Gateway** (port 4000): REST API and authentication
- **Execution Service** (port 4001): Order processing and matching
- **Event Service** (port 4002): WebSocket server and event broadcasting

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

Create a PostgreSQL database on [Neon](https://neon.tech) and run the schema:

```bash
# Connect to your database and run:
psql $DATABASE_URL -f scripts/001-create-tables.sql
```

### 3. Set Up Redis

Create a Redis instance on [Redis Cloud](https://redis.com/try-free/) and get your connection URL.

### 4. Environment Variables

Create `.env` files in each service directory:

**apps/api-gateway/.env**
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:3000
PORT=4000
```

**apps/execution-service/.env**
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PORT=4001
```

**apps/event-service/.env**
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PORT=4002
```

### 5. Run Development

Start all services:

```bash
npm run dev
```

Or run services individually:

```bash
# Terminal 1 - Frontend
cd apps/web && npm run dev

# Terminal 2 - API Gateway
cd apps/api-gateway && npm run dev

# Terminal 3 - Execution Service
cd apps/execution-service && npm run dev

# Terminal 4 - Event Service
cd apps/event-service && npm run dev
```

## Features

- Real-time BTC/USDT price updates from Binance
- Instant order matching and execution
- Event sourcing with PostgreSQL
- WebSocket-based live updates
- JWT authentication with HTTP-only cookies
- User balance management
- Order history and trade history
- Live price charting

## Tech Stack

- **Turborepo** - Monorepo management
- **Next.js 16** - Frontend framework
- **Express** - Backend services
- **PostgreSQL** - Database
- **Redis** - Pub/Sub and caching
- **WebSocket** - Real-time communication
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling

## Project Structure

```
├── apps/
│   ├── api-gateway/       # REST API and authentication
│   ├── execution-service/ # Order execution
│   ├── event-service/     # WebSocket and events
│   └── web/               # Next.js frontend (current directory)
├── packages/
│   └── shared/            # Shared types and utilities
└── scripts/               # Database scripts
```

## License

MIT
