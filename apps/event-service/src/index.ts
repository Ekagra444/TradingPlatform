import express from "express"
import { WebSocketServer, WebSocket } from "ws"
import { createServer } from "http"
import dotenv from "dotenv"
import { createClient } from "redis"
import { pool } from "./db"
import { EventType } from "@trading-platform/shared"
import { CandlestickAggregator }  from "./candlestick-aggregator"
dotenv.config()

const app = express()
const PORT = 4002

const server = createServer(app)
const wss = new WebSocketServer({ server })

// Redis clients
const redisPub = createClient({
  username: "default",
  password: process.env.redisPassword,
  socket: {
    host: "redis-19469.crce263.ap-south-1-1.ec2.cloud.redislabs.com",
    port: 19469,
  },
})

const redisSub = createClient({
  username: "default",
  password: process.env.redisPassword,
  socket: {
    host: "redis-19469.crce263.ap-south-1-1.ec2.cloud.redislabs.com",
    port: 19469,
  },
})

redisPub.on("error", (err) => console.error("Redis Pub Error", err))
redisSub.on("error", (err) => console.error("Redis Sub Error", err))


app.use(express.json())

app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "event-service" })
})

// Store connected clients
const clients = new Set<WebSocket>()

wss.on("connection", (ws: WebSocket) => {
  console.log("New WebSocket connection")
  clients.add(ws)

  ws.on("close", () => {
    console.log("WebSocket connection closed")
    clients.delete(ws)
  })

  ws.on("error", (error) => {
    console.error("WebSocket error:", error)
    clients.delete(ws)
  })

  // Send initial connection message
  ws.send(JSON.stringify({ type: "connected", message: "Connected to trading platform" }))
})

// Broadcast to all connected clients
function broadcast(data: any) {
  const message = JSON.stringify(data)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}


const aggregators = new Map<string, CandlestickAggregator>([

  ["1m", new CandlestickAggregator("BTCUSDT")],

  ["5m", new CandlestickAggregator("BTCUSDT")],

  ["15m", new CandlestickAggregator("BTCUSDT")],

  ["1h", new CandlestickAggregator("BTCUSDT")],

  ["4h", new CandlestickAggregator("BTCUSDT")],

  ["1d", new CandlestickAggregator("BTCUSDT")],

])


const timeframeMs = {

  "1m": 60 * 1000,

  "5m": 5 * 60 * 1000,

  "15m": 15 * 60 * 1000,

  "1h": 60 * 60 * 1000,

  "4h": 4 * 60 * 60 * 1000,

  "1d": 24 * 60 * 60 * 1000,

}

const lastCandleTime = new Map<string, number>()

// Connect to Binance WebSocket for BTC/USDT
function connectBinance() {
  const binanceWs = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade")

  binanceWs.on("open", () => {
    console.log("Connected to Binance WebSocket")
  })

  binanceWs.on("message", async (data: Buffer) => {
    try {
      const trade = JSON.parse(data.toString())
      const price = Number.parseFloat(trade.p)
      const timestamp = new Date(trade.T)

      for (const [timeframe, aggregator] of aggregators) {
        aggregator.addPrice(price, timestamp)

        const tf = timeframeMs[timeframe as keyof typeof timeframeMs]
        const candleTime = Math.floor(timestamp.getTime() / tf) * tf
        const lastTime = lastCandleTime.get(timeframe) || 0

        // If this is a new candle period, persist the previous completed candle
        if (candleTime > lastTime && lastTime > 0) {
          const candles = aggregator.aggregateCandles(tf)
          const completedCandle = candles.get(lastTime.toString())
          if (completedCandle) {
            console.log(` Persisting ${timeframe} candle at ${new Date(lastTime).toISOString()}`)
            await aggregator.persistCandle(timeframe, new Date(lastTime), new Date(lastTime + tf), completedCandle)
          }
        }

        // Update the last candle time
        if (candleTime !== lastTime) {
          lastCandleTime.set(timeframe, candleTime)
        }
      }
      // Publish price update to Redis
      await redisPub.publish(
        "price:updates",
        JSON.stringify({
          symbol: "BTCUSDT",
          price,
          timestamp: new Date(trade.T),
        }),
      )

      // Broadcast to WebSocket clients
      broadcast({
        type: EventType.PRICE_UPDATE,
        data: {
          symbol: "BTCUSDT",
          price,
          timestamp: new Date(trade.T),
        },
      })
    } catch (error) {
      console.error("Error processing Binance message:", error)
    }
  })

  binanceWs.on("error", (error) => {
    console.error(" Binance WebSocket error:", error)
  })

  binanceWs.on("close", () => {
    console.log(" Binance WebSocket closed, reconnecting in 5s...")
    setTimeout(connectBinance, 5000)
  })
}

async function start() {
  try {
    await redisPub.connect()
    await redisSub.connect()

    console.log("Connected to Redis")

    // Subscribe to order events
    await redisSub.subscribe("order:events", async (message) => {
      const event = JSON.parse(message)
      console.log(" Received order event:", event.type)

      // Broadcast to WebSocket clients
      broadcast({
        type: event.type,
        data: event,
      })

      // Store event in database
      await pool.query("INSERT INTO order_events (id, type, order_id, data) VALUES (gen_random_uuid(), $1, $2, $3)", [
        event.type,
        event.orderId || null,
        JSON.stringify(event),
      ])
    })

    console.log("Subscribed to order:events channel")

    // Connect to Binance for live price data
    connectBinance()

    server.listen(PORT, () => {
      console.log(`Event Service running on port ${PORT}`)
      console.log(`WebSocket server running on ws://localhost:${PORT}`)
    })
  } catch (error) {
    console.error("Failed to start Event Service:", error)
    process.exit(1)
  }
}
process.on("SIGINT", async () => {
  console.log("Shutting down...")
  await redisPub.quit()
  await redisSub.quit()
  process.exit(0)
})

start()
