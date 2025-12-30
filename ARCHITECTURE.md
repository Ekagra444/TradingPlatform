Complete internal documentation for future reference and maintenance
# Real-Time Trading Platform - Architecture Documentation

**For**: Internal reference and future maintenance
**Last Updated**: January 2025
**Author**: Development Team

## Table of Contents

1. [System Overview](#system-overview)
2. [Service Architecture](#service-architecture)
3. [Database Design](#database-design)
4. [Event Flow](#event-flow)
5. [Candlestick Persistence](#candlestick-persistence)
6. [Authentication Flow](#authentication-flow)
7. [Order Execution Pipeline](#order-execution-pipeline)
8. [Development Guide](#development-guide)
9. [Known Limitations](#known-limitations)
10. [Future Improvements](#future-improvements)

---

## System Overview

### High-Level Architecture

The platform is a **microservices-based event-driven system** with 4 main services communicating via:
- **HTTP/REST** for stateless commands (orders, auth, queries)
- **Redis Pub/Sub** for event broadcasting between services
- **WebSocket** for real-time client updates

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Event Sourcing** | Complete audit trail; reconstruct state at any point |
| **No ORM (Raw SQL)** | Better control, easier debugging for trading system |
| **Redis Pub/Sub over Message Queue** | Lower latency, sufficient for trading volume |
| **Native WebSocket vs Socket.IO** | Lighter footprint, less overhead |
| **Instant Fill Matching** | Simpler logic, works for single-sided market |
| **Candlestick Aggregation in Event Service** | Aggregation near price source reduces network overhead |

---

## Service Architecture

### 1. Frontend (apps/web)

**Technology**: Next.js 16 + React 19 + Tailwind CSS v4

**Responsibilities**:
- User authentication (login/register)
- Display trading dashboard
- Render candlestick charts with lightweight-charts library
- Handle WebSocket connections for real-time updates
- Submit orders and manage user balance

**Key Components**:
- `trading-dashboard.tsx` - Main layout and state management
- `price-chart.tsx` - Chart rendering with timeframe selection
- `order-book.tsx` - Display open orders and trades
- `auth-form.tsx` - Login/register UI

**State Management**:
- WebSocket connection stored in context
- Real-time prices from Event Service
- Order history from API Gateway

**Candlestick Aggregation**:
- `lib/candlestick-aggregator.ts` converts price array to OHLC candles
- Runs on client-side for display (separate from persistence)
- Switches between 1m, 5m, 15m, 1h, 4h, 1d timeframes

### 2. API Gateway (apps/api-gateway)

**Technology**: Express.js + PostgreSQL + Redis

**Responsibilities**:
- User authentication (register, login, logout)
- REST endpoints for orders and user info
- Balance management
- Route validation and error handling
- JWT token generation and verification

**Ports**: 4000

**Routes**:
```
POST   /auth/register        - Register new user
POST   /auth/login           - Login (returns JWT cookie)
POST   /auth/logout          - Clear JWT cookie

GET    /user/profile         - Get user info & balance (auth required)
GET    /user/history         - Get user's order history (auth required)

POST   /orders/place         - Create new order (auth required)
GET    /orders/open          - Get open orders (auth required)
GET    /orders/history       - Get closed orders (auth required)

GET    /market/price         - Get latest BTC/USDT price
GET    /market/candlesticks  - Get historical candlesticks
GET    /market/trades        - Get recent executed trades
```

**Database Access Pattern**:
```typescript
// Connection pooling to prevent exhaustion
const pool = new Pool({ connectionString: DATABASE_URL })
const result = await pool.query('SELECT ...')
```

**Authentication Flow**:
1. User sends credentials to `/auth/login`
2. API Gateway queries users table, verifies password with bcrypt
3. Generates JWT token, sets as HTTP-only cookie
4. Frontend sends cookie automatically on subsequent requests
5. `auth.middleware.ts` validates JWT on protected routes

**Critical Business Logic**:
```
POST /orders/place:
  1. Validate user is authenticated
  2. Get user's current balance
  3. Check sufficient balance for order
  4. Insert into order_commands table
  5. Publish 'order-placed' event to Redis Pub/Sub
  6. Execution Service listens and processes
```

### 3. Execution Service (apps/execution-service)

**Technology**: Express.js + PostgreSQL + Redis

**Responsibilities**:
- Process order placement commands
- Execute instant matching (market orders)
- Update user balances atomically
- Persist trade records
- Publish execution events

**Ports**: 4001

**Core Logic**:
```
Listens to Redis: 'order-placed' channel
  1. Get order details from order_commands table
  2. Query current price from order_events
  3. Calculate trade amount: quantity * current_price
  4. Check user balance (should be pre-validated by API Gateway)
  5. Execute trade atomically:
     - INSERT into trades table
     - UPDATE users.balance
     - INSERT into order_events (as FILLED event)
  6. Publish 'order-executed' event back to Redis
```

**Why Separate Service?**:
- Isolated order processing prevents API Gateway overload
- Can scale independently based on order volume
- Critical business logic decoupled from REST API
- Easy to add sophisticated matching logic later

**Error Handling**:
- Insufficient balance → Reject order
- Database errors → Rollback transaction, log error
- Price changed drastically → Log warning, still execute (acceptable for demo)

### 4. Event Service (apps/event-service)

**Technology**: Express.js + WebSocket + Binance API + PostgreSQL + Redis

**Responsibilities**:
- Connect to Binance WebSocket for real-time prices
- Aggregate prices into candlesticks by timeframe
- Persist candlesticks to database
- Broadcast price updates to all connected clients via WebSocket
- Subscribe to order execution events and broadcast to clients

**Ports**: 4002

**WebSocket Protocol**:
```
Client connects: ws://localhost:4002
Server sends: { type: 'price', symbol: 'BTCUSDT', price: 45000.50, timestamp: 1234567890 }
```

**Binance Integration**:
```
ws://stream.binance.com:9443/ws/btcusdt@trade
  → Receives: { s: 'BTCUSDT', p: '45000.50', T: 1234567890 }
  → Transform to internal format
  → Broadcast via Redis Pub/Sub
```

**Candlestick Aggregation** (`candlestick-aggregator.ts`):
```
Input: Stream of prices
  { price: 45000.50, time: 1234567890 }
  { price: 45001.20, time: 1234567891 }
  ...

Process:
  1. Group prices by timeframe (1m = 60 seconds)
  2. Calculate OHLC:
     - Open: first price in period
     - High: max price in period
     - Low: min price in period
     - Close: last price in period
  3. When period ends, persist to database
  4. Emit new candle to WebSocket clients

Output: Candlestick persistence trigger
```

---

## Database Design

### Schema Overview

**4 Main Tables**:

#### 1. `users`
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  balance DECIMAL(18,8) DEFAULT 10000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
- Starting balance: $10,000 USDT
- Password stored as bcrypt hash
- Balance updated on every trade execution

#### 2. `order_commands`
```sql
CREATE TABLE order_commands (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(10),        -- 'buy' or 'sell'
  quantity DECIMAL(18,8) NOT NULL,
  status VARCHAR(20),      -- 'pending', 'filled', 'rejected'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
- Event sourcing: log of all order requests
- Immutable audit trail
- Used to reconstruct order history

#### 3. `order_events`
```sql
CREATE TABLE order_events (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES order_commands(id),
  event_type VARCHAR(50),  -- 'submitted', 'filled', 'rejected'
  price DECIMAL(18,8),
  filled_quantity DECIMAL(18,8),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
- Event sourcing table for orders
- Tracks state transitions
- Complete history for debugging

#### 4. `trades`
```sql
CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(10),        -- 'buy' or 'sell'
  quantity DECIMAL(18,8) NOT NULL,
  price DECIMAL(18,8) NOT NULL,
  total DECIMAL(18,8) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
- Executed trades record
- Source of truth for balance calculations
- Used for trade history and P&L

#### 5. `candlesticks`
```sql
CREATE TABLE candlesticks (
  id SERIAL PRIMARY KEY,
  timeframe VARCHAR(10),   -- '1m', '5m', '15m', '1h', '4h', '1d'
  open_price DECIMAL(18,8) NOT NULL,
  high_price DECIMAL(18,8) NOT NULL,
  low_price DECIMAL(18,8) NOT NULL,
  close_price DECIMAL(18,8) NOT NULL,
  volume DECIMAL(18,8),
  open_time TIMESTAMP NOT NULL,
  close_time TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(timeframe, open_time)
);
```
- Stores aggregated candlesticks
- One row per candle per timeframe
- Indexed on (timeframe, open_time) for fast queries
- Auto-delete after 30 days via function

### Why Event Sourcing?

**Event Sourcing Pattern**:
- Append-only logs (order_commands, order_events)
- Reconstruct state from events
- Complete audit trail
- No data loss even if balance calculation has bugs

**Example**:
```
User places order: INSERT INTO order_commands
System executes:   INSERT INTO order_events (FILLED)
Balance updates:   UPDATE users SET balance = balance - amount
```

To verify user's balance:
```sql
SELECT balance FROM users WHERE id = 1;
-- OR reconstruct from events:
SELECT 10000 - SUM(total) FROM trades WHERE user_id = 1 AND type = 'buy' ...
```

---

## Event Flow

### Complete Order Lifecycle

```
1. User clicks "Buy 1 BTC"
   └─→ Frontend: POST /orders/place { quantity: 1, type: 'buy' }

2. API Gateway: /orders/place handler
   ├─→ Check JWT token (auth middleware)
   ├─→ Get user balance
   ├─→ Validate: balance > (quantity * current_price)
   └─→ INSERT INTO order_commands (user_id, quantity, type, status='pending')
       └─→ Publish: Redis PUBLISH 'order-placed', JSON

3. Execution Service: Listening on 'order-placed' channel
   ├─→ Get order details from order_commands
   ├─→ Get current price (from last event in order_events)
   ├─→ BEGIN TRANSACTION
   ├─→ INSERT INTO trades (user_id, quantity, price, total, type)
   ├─→ INSERT INTO order_events (order_id, event_type='FILLED', price)
   ├─→ UPDATE users SET balance = balance - total
   ├─→ COMMIT TRANSACTION
   └─→ Publish: Redis PUBLISH 'order-executed', JSON

4. Event Service: Listening on 'order-executed' channel
   └─→ Broadcast via WebSocket to all connected clients:
       { type: 'trade-executed', orderId: 123, price: 45000.50, quantity: 1 }

5. Frontend: WebSocket listener receives trade confirmation
   ├─→ Update local state: orders, balance, trade history
   └─→ UI updates in real-time
```

### Price Update Flow

```
1. Binance WebSocket → Event Service
   { s: 'BTCUSDT', p: '45001.20', T: 1234567890 }

2. Event Service: candlestick-aggregator.ts
   ├─→ Store price in memory
   ├─→ Check if candle period (1m, 5m, etc) ended
   ├─→ If ended:
   │   ├─→ Calculate OHLC
   │   ├─→ INSERT INTO candlesticks table
   │   └─→ Publish: Redis PUBLISH 'candle-closed', JSON
   └─→ Broadcast latest price via WebSocket

3. Frontend: WebSocket listener
   ├─→ Receive: { type: 'price', price: 45001.20 }
   ├─→ Add to price history array
   └─→ Chart updates (lightweight-charts library)
```

---

## Candlestick Persistence

### Why Persistent Candlesticks?

**Problem**: Every refresh starts chart from scratch
**Solution**: Store candlesticks in database

### How It Works

#### Aggregation (Event Service)

File: `apps/event-service/src/candlestick-aggregator.ts`

```typescript
class CandlestickAggregator {
  // Tracks current candle being built
  currentCandles: Map<string, {
    open: number
    high: number
    low: number
    close: number
    time: number
  }>

  addPrice(price: number, timestamp: number) {
    const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
    
    timeframes.forEach(tf => {
      const bucket = this.getTimeBucket(timestamp, tf)
      const candle = this.currentCandles.get(tf) || {
        open: price,
        high: price,
        low: price,
        close: price,
        time: bucket
      }
      
      candle.high = Math.max(candle.high, price)
      candle.low = Math.min(candle.low, price)
      candle.close = price
      
      this.currentCandles.set(tf, candle)
      
      // Check if candle closed
      if (this.isCandle Closed(bucket, tf)) {
        this.persistCandle(tf, candle)
        this.currentCandles.delete(tf)
      }
    })
  }

  persistCandle(timeframe: string, candle: any) {
    const sql = `
      INSERT INTO candlesticks 
      (timeframe, open_price, high_price, low_price, close_price, open_time)
      VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
      ON CONFLICT DO NOTHING
    `
    // Execute INSERT
    console.log(` Persisting ${timeframe} candle`)
  }
}
```

#### Frontend Load (Price Chart)

File: `apps/web/components/price-chart.tsx`

```typescript
useEffect(() => {
  // On mount, fetch historical candlesticks
  const fetchHistory = async () => {
    const response = await fetch(
      `/api/market/candlesticks?timeframe=${currentTimeframe}&limit=500`
    )
    const candlesticks = await response.json()
    // Load into chart
    if (lineSeriesRef.current) {
      lineSeriesRef.current.setData(candlesticks.map(c => ({
        time: c.open_time,
        value: c.close_price
      })))
    }
  }
  
  fetchHistory()
}, [currentTimeframe])
```

#### Retention Policy

```sql
-- Delete candlesticks older than 30 days (runs in DB)
DELETE FROM candlesticks 
WHERE created_at < NOW() - INTERVAL '30 days'
```

### Debugging Candlestick Issues

**Chart starts from zero on refresh**:
```
1. Check: Is table 002-create-candlesticks-table.sql executed?
   SELECT * FROM information_schema.tables WHERE table_name = 'candlesticks';

2. Check: Are inserts happening?
   SELECT COUNT(*) FROM candlesticks;
   (Should increase over time)

3. Check: Event Service logs
    Persisting 1m candle at 2025-01-15T10:30:00.000Z
   (If missing, aggregator isn't triggering)

4. Check: API endpoint returns data
   curl 'http://localhost:4000/api/market/candlesticks?timeframe=1m'
   (Should return array of candles)
```

---

## Authentication Flow

### Registration

```
1. User enters email + password on /register

2. Frontend: POST /auth/register
   { email: "user@example.com", password: "secret123" }

3. API Gateway: /auth/register handler
   ├─→ Validate email format
   ├─→ Hash password with bcrypt (10 rounds)
   ├─→ INSERT INTO users (email, password_hash, balance)
   ├─→ Generate JWT: sign({ userId, email }, JWT_SECRET, expiresIn: '1h')
   └─→ Set HTTP-only cookie: 'token=JWT...' (secure, httpOnly, sameSite)

4. Frontend: Receives cookie automatically
   └─→ Redirect to /dashboard
```

### Login

```
1. User enters email + password on /login

2. Frontend: POST /auth/login
   { email: "user@example.com", password: "secret123" }

3. API Gateway: /auth/login handler
   ├─→ Query: SELECT * FROM users WHERE email = $1
   ├─→ Compare password: bcrypt.compare(plaintext, hash)
   ├─→ If match:
   │   ├─→ Generate JWT
   │   └─→ Set HTTP-only cookie
   └─→ If no match: Return 401 Unauthorized

4. Frontend: Redirects to dashboard
```

### Protected Routes

```
Frontend: GET /user/profile
  │
  └─→ Browser auto-sends cookie (HTTP-only)
        │
        └─→ API Gateway: auth.middleware.ts
              ├─→ Extract JWT from cookie
              ├─→ Verify with JWT_SECRET
              ├─→ If valid: continue to route handler
              ├─→ If invalid: return 401
              └─→ If expired: return 401
```

### Security Notes

- JWT_SECRET stored in environment, not in code
- Passwords hashed with bcrypt (slow, resistant to GPU attacks)
- Cookies HTTP-only (inaccessible to JavaScript, prevents XSS)
- Cookies Secure flag (HTTPS only in production)
- SameSite=strict (prevents CSRF)
- Token expiry: 1 hour (forces re-login periodically)

---

## Order Execution Pipeline

### Buy Order Execution

```
Input: User wants to buy 1 BTC at market price

1. Frontend calls: POST /orders/place
   { type: 'buy', quantity: 1 }

2. API Gateway pre-validation:
   ├─→ Get current price: SELECT price FROM order_events ORDER BY timestamp DESC LIMIT 1
   ├─→ Calculate total: 1 * 45000 = 45000 USDT
   ├─→ Check balance: SELECT balance FROM users WHERE id = $1
   ├─→ Verify: 45000 <= balance (else 400 Bad Request)
   └─→ INSERT INTO order_commands (user_id, type, quantity, status='pending')

3. Redis Pub/Sub trigger:
   Execution Service listening on 'order-placed' channel

4. Execution Service executes atomically:
   BEGIN TRANSACTION
     a. Get current price (latest trade)
     b. Calculate total = quantity * price
     c. INSERT INTO trades (user_id, type, quantity, price, total, created_at)
     d. INSERT INTO order_events (order_id, event_type='FILLED', price, filled_quantity)
     e. UPDATE users SET balance = balance - total WHERE id = $1
   COMMIT TRANSACTION
   
   If error: ROLLBACK (balance unchanged)

5. Confirm to clients:
   Publish: Redis PUBLISH 'order-executed'
   Event Service broadcasts: WebSocket message to frontend
   Frontend updates: balance display, order history, chart
```

### Sell Order Execution

Similar flow, but adds BTC back to some "position" field (not implemented yet).

```
UPDATE users SET balance = balance + total (for USDT)
-- Future: Add btc_holdings tracking
```

---

## Development Guide

### Adding a New API Endpoint

Example: Add `GET /user/balance` endpoint

```typescript
// apps/api-gateway/src/routes/user.ts
import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { pool } from '../db'

const router = Router()

router.get('/balance', authMiddleware, async (req: any, res) => {
  try {
    const userId = req.user.id
    const result = await pool.query(
      'SELECT balance FROM users WHERE id = $1',
      [userId]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    res.json({ balance: result.rows[0].balance })
  } catch (error) {
    console.error(' Error fetching balance:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
```

Then register in `index.ts`:
```typescript
import userRoutes from './routes/user'
app.use('/user', userRoutes)
```

### Adding a New Database Table

1. Create migration file: `scripts/003-add-my-feature.sql`
2. Write CREATE TABLE statement
3. Execute in Neon PostgreSQL
4. Test queries locally
5. Document in ARCHITECTURE.md

### Adding Real-Time Broadcast

Example: Broadcast balance updates

```typescript
// In execution-service when balance changes
const payload = { userId, newBalance }
await redis.publish('balance-updated', JSON.stringify(payload))

// In event-service WebSocket handler
redis.subscribe('balance-updated', (message) => {
  const { userId, newBalance } = JSON.parse(message)
  broadcast({ type: 'balance-updated', userId, newBalance })
})

// In frontend
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data)
  if (data.type === 'balance-updated') {
    setBalance(data.newBalance)
  }
})
```

### Debugging Tips

**Check what's in Redis**:
```bash
redis-cli
> KEYS *
> GET my_key
```

**Check database contents**:
```bash
psql $DATABASE_URL
=> SELECT * FROM users;
=> SELECT * FROM trades WHERE user_id = 1;
=> SELECT COUNT(*) FROM candlesticks;
```

**Watch Event Service logs**:
```bash
npm run dev --filter=event-service | grep "\[v0\]"
```

**Test API endpoints**:
```bash
curl -X POST http://localhost:4000/orders/place \
  -H "Content-Type: application/json" \
  -d '{ "type": "buy", "quantity": 1 }'
```

---

## Known Limitations

1. **No Position Tracking**
   - System tracks USDT balance only
   - No `btc_holdings` field to track Bitcoin owned
   - Impact: Can't calculate P&L or account balance in BTC

2. **No Limit Orders**
   - Only market orders (instant fill)
   - Orders always execute immediately at current price
   - No order book, no price levels

3. **No Leverage/Margin**
   - 1x only (no shorting)
   - Maximum bet: full account balance
   - No liquidation mechanics

4. **Single Trading Pair**
   - BTC/USDT only
   - Hardcoded Binance stream path
   - To add pairs: Modify event-service Binance connection

5. **No Order Cancellation**
   - All orders execute instantly, no cancel option
   - Even if you wanted to cancel, no route implemented

6. **No Fee Logic**
   - All trades execute fee-free
   - In production: subtract fees from balance

7. **Candlestick Precision**
   - 8 decimal places (matches Binance)
   - No rounding for display
   - Micro-price swings can cause chart jitter

8. **Redis Connection Pooling**
   - Single client per service
   - No connection health checks
   - Reconnection on failure is automatic but can have brief downtime

---

## Future Improvements

### Short-Term

- [ ] Implement order cancellation (`DELETE /orders/:id`)
- [ ] Add BTC holdings tracking (`users.btc_balance`)
- [ ] Add P&L calculation endpoint
- [ ] Order type indicators (buy = green, sell = red)
- [ ] Real-time balance update WebSocket broadcast

### Medium-Term

- [ ] Support limit orders (with order book)
- [ ] Multiple trading pairs (ETH, SOL, etc)
- [ ] User account funding/withdrawal
- [ ] Trade fees and tax calculation
- [ ] Order history pagination
- [ ] Advanced chart indicators (MA, RSI, MACD)

### Long-Term

- [ ] Leverage and margin trading
- [ ] Portfolio analytics dashboard
- [ ] Mobile app (React Native)
- [ ] Backtesting engine for strategies
- [ ] Automated trading bots
- [ ] Real exchange integration (Binance Spot API)

### Infrastructure

- [ ] Kubernetes deployment
- [ ] Horizontal scaling (multiple instances)
- [ ] Database connection pooling tuning
- [ ] Redis cluster setup
- [ ] Monitoring and alerting (Datadog, New Relic)
- [ ] Performance testing under load

---

## Common Issues & Solutions

### Redis Connection Pool Exhaustion

**Symptom**: `ERR max number of clients reached`

**Cause**: Services creating new connections without closing

**Solution**:
```typescript
// Ensure single client per service
export const redis = createClient({ url: REDIS_URL })
redis.on('error', console.error)

// Proper shutdown
process.on('SIGTERM', async () => {
  await redis.disconnect()
  process.exit(0)
})
```

### Candlesticks Not Persisting

**Symptom**: Chart starts from zero on refresh

**Cause**: 
- Table 002 not executed
- Aggregator not detecting closed candles
- Database INSERT failing silently

**Debug**:
```sql
-- Check table exists
SELECT * FROM information_schema.tables WHERE table_name='candlesticks';

-- Check data
SELECT COUNT(*), timeframe FROM candlesticks GROUP BY timeframe;

-- Check most recent
SELECT * FROM candlesticks ORDER BY created_at DESC LIMIT 5;
```

### WebSocket Not Updating

**Symptom**: Price chart static, no real-time updates

**Cause**:
- Event Service not connecting to Binance
- WebSocket connection closed
- Wrong port specified

**Debug**:
```bash
# Check if Event Service running
lsof -i :4002

# Watch WebSocket messages
# In browser DevTools: Network tab, WS filter

# Check Binance connectivity
curl https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
```

---

## Maintenance Checklist

**Weekly**:
- [ ] Check application error logs
- [ ] Verify all services responding
- [ ] Spot check database size growth
- [ ] Monitor Redis memory usage

**Monthly**:
- [ ] Backup PostgreSQL database
- [ ] Review and delete old candlesticks (30+ days)
- [ ] Analyze slow queries
- [ ] Review user feedback

**Quarterly**:
- [ ] Update dependencies (npm packages)
- [ ] Security audit (bcrypt rounds, JWT secret rotation)
- [ ] Performance tuning
- [ ] Capacity planning

---

**End of Architecture Documentation**

For implementation questions or technical decisions, refer to the commit history and comments in the codebase.
