# Real-Time Cryptocurrency Trading Platform

A production-ready event-driven trading platform for real-time cryptocurrency trading with instant order execution, live price charts, and persistent candlestick data storage.

## Features

- **Real-Time Price Updates**: Live BTC/USDT quotes from Binance WebSocket
- **Instant Order Execution**: Market buy/sell orders matched at current prices
- **Persistent Charts**: 1-month candlestick history with multiple timeframes (1m, 5m, 15m, 1h, 4h, 1d)
- **Event Sourcing**: Complete audit trail of all trades and orders
- **Secure Authentication**: JWT-based auth with HTTP-only cookies
- **Live Order Book**: Real-time order updates via WebSocket
- **User Balances**: Track positions and available balance in real-time
- **Trade History**: Full trade execution history with timestamps and prices

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4 |
| **Backend Services** | Express.js, TypeScript |
| **Real-Time** | Native WebSocket (ws), Binance API |
| **Database** | PostgreSQL (Neon) with event sourcing |
| **Cache & Events** | Redis Cloud with Pub/Sub |
| **Monorepo** | Turborepo with npm workspaces |

## Quick Start

### Prerequisites

- Node.js 18+
- npm (comes with Node)
- PostgreSQL database (free tier at [neon.tech](https://neon.tech))
- Redis instance (free tier at [redis.com](https://redis.com/try-free/))

## Sample Dashboard

![Trading Dashboard Candlestick](public/candleStick.png)
![Trading Dashboard Line chart](public/lineChart.png)

### 1. Clone & Install

```bash
git clone <repository>
cd real-time-trading-platform
npm install
```

### 2. Create Databases

**PostgreSQL** (Neon):
1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project and copy your connection string
3. Note the format: `postgresql://user:password@host/database`

**Redis Cloud**:
1. Go to [redis.com/try-free](https://redis.com/try-free/)
2. Create a new database
3. Copy the connection URL

### 3. Set Up Database Schema

Connect to your PostgreSQL database and run:

```bash
# Option A: Using psql
psql "YOUR_DATABASE_URL" -f scripts/001-create-tables.sql
psql "YOUR_DATABASE_URL" -f scripts/002-create-candlesticks-table.sql

# Option B: Copy-paste the SQL files into your database UI
```

### 4. Add Environment Variables

Create `.env` files in each service :

**Root level (.env ):**
```
DATABASE_URL=postgresql://user:password@host/database
REDIS_URL=redis://:password@host:port
JWT_SECRET=your-random-secret-key-min-32-chars
FRONTEND_URL=http://localhost:3000
```

### 5. Start Development

```bash
npm run dev
```

This starts all services simultaneously:
- Frontend: http://localhost:3000
- API Gateway: http://localhost:4000
- Execution Service: http://localhost:4001
- Event Service: http://localhost:4002

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Frontend (Next.js)                  │
│           Trading Dashboard & Charts             │
└──────────────────┬──────────────────────────────┘
                   │ REST/WebSocket
                   ↓
┌──────────────────────────────────────┐
│        API Gateway (Express)          │
│  Auth, Orders, User, Market Routes    │
└──────────┬─────────────┬──────────────┘
           │             │ Redis Pub/Sub
           ↓             ↓
    ┌─────────────┐  ┌──────────────────┐
    │ Execution   │  │ Event Service    │
    │ Service     │  │ (WebSocket)      │
    └─────────────┘  │ Binance Connect  │
           ↓         └──────────────────┘
    ┌──────────────────────────────────┐
    │      PostgreSQL Database          │
    │  • Users & Balances              │
    │  • Orders & Trades               │
    │  • Candlestick History           │
    │  • Event Sourcing Log            │
    └──────────────────────────────────┘
```

## API Endpoints

### Authentication
- `POST /auth/register` - Create account
- `POST /auth/login` - Login (returns JWT in cookie)
- `POST /auth/logout` - Logout

### User
- `GET /user/profile` - Get user info and balance
- `GET /user/history` - Get order history

### Orders
- `POST /orders/place` - Place buy/sell order
- `GET /orders/open` - Get open orders
- `GET /orders/history` - Get executed orders

### Market
- `GET /market/price` - Current BTC/USDT price
- `GET /market/candlesticks?timeframe=1m&limit=500` - Historical candlesticks
- `GET /market/trades` - Recent trades

### WebSocket (ws://localhost:4002)
- Subscribe to `price-updates` for live prices
- Subscribe to `order-updates` for order status changes
- Subscribe to `trade-updates` for executed trades

## Default Account

When you first run the app, create an account with:
- **Starting Balance**: $10,000 USDT
- **Minimum Order**: Any amount (decimal supported)
- **Leverage**: Not supported (1x only)
- **Fees**: None (demo mode)

## Troubleshooting

### "Cannot connect to Redis"
- Make sure `REDIS_URL` is set correctly
- Check Redis Cloud dashboard for connection URL
- Verify credentials and whitelist your IP

### "Database connection failed"
- Verify `DATABASE_URL` format is correct
- Test connection: `psql "YOUR_URL"`
- Ensure SQL scripts (001 & 002) have been executed

### "No prices showing on chart"
- Check Event Service is running (port 4002)
- Verify WebSocket connection in browser DevTools
- Ensure Binance API is accessible (check firewall)

### Chart starts from zero on refresh
- Make sure script `002-create-candlesticks-table.sql` was executed
- Check Event Service logs for persistence messages
- Candlesticks appear after timeframe period closes

## Useful Commands

```bash
# Run all services
npm run dev

# Run specific service
npm run dev --filter=api-gateway
npm run dev --filter=event-service
npm run dev --filter=execution-service
npm run dev --filter=web

# Build for production
npm run build

# Lint code
npm run lint

# Type check
npm run type-check
```

## Project Structure

```
├── apps/
│   ├── api-gateway/          # REST API & authentication
│   │   ├── src/
│   │   │   ├── index.ts      # Server setup
│   │   │   ├── db.ts         # Database connection
│   │   │   ├── middleware/   # Auth middleware
│   │   │   └── routes/       # API endpoints
│   │   └── package.json
│   │
│   ├── execution-service/    # Order matching & execution
│   │   ├── src/
│   │   │   ├── index.ts      # Service logic
│   │   │   └── db.ts         # Database access
│   │   └── package.json
│   │
│   ├── event-service/        # WebSocket & Binance
│   │   ├── src/
│   │   │   ├── index.ts      # WebSocket server
│   │   │   ├── db.ts         # Database access
│   │   │   └── candlestick-aggregator.ts
│   │   └── package.json
│   │
│   └── web/                  # Next.js frontend
│       ├── app/              # Next.js app directory
│       ├── components/       # React components
│       │   ├── ui/           # Reusable UI components
│       │   ├── trading-dashboard.tsx
│       │   ├── price-chart.tsx
│       │   └── ...
│       ├── lib/              # Utilities
│       └── package.json
│
├── packages/
│   └── shared/               # Shared types & utilities
│       ├── src/
│       │   ├── types.ts      # Shared TypeScript types
│       │   └── index.ts
│       └── package.json
│
├── scripts/
│   ├── 001-create-tables.sql      # Core schema
│   └── 002-create-candlesticks-table.sql  # Candlestick storage
│
├── turbo.json                # Turborepo config
├── package.json              # Root package.json
└── README.md                 # This file
```

## Environment Variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://...` | Neon PostgreSQL connection |
| `REDIS_URL` | Yes | `redis://:pass@host:port` | Redis Cloud connection |
| `JWT_SECRET` | Yes | `super-secret-key-32-chars` | JWT signing secret |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL (for redirects) |

## Performance Tips

- **Chart Performance**: Reduce data points by selecting larger timeframes
- **WebSocket Updates**: Real-time updates use native WebSocket (optimized)
- **Database Queries**: Candlesticks are cached after 1 month cutoff
- **Order Execution**: Async processing with Redis Pub/Sub for low latency

## Security Considerations

- Passwords are hashed with bcrypt
- JWT tokens expire after 1 hour
- All database queries use parameterized statements
- HTTP-only cookies prevent XSS attacks
- CORS restricted to frontend URL

## Future Enhancements

- Order cancellation and modification
- Limit orders (not just market)
- Advanced charting indicators
- Portfolio diversification
- Price alerts and notifications
- Mobile app version

## License

MIT - Feel free to use this project for learning and development.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review service logs in the console
3. Check PostgreSQL and Redis connectivity
4. Ensure all environment variables are set correctly

---

**Happy Trading!** 📈

Built with passion for real-time financial systems.
