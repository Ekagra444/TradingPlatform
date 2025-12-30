import express from "express"
import dotenv from "dotenv"
import { createClient } from "redis"
import { pool } from "./db"
import { EventType, OrderSide, OrderType } from "@trading-platform/shared"
import { randomUUID } from "crypto"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4001

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

let currentPrice = 0

app.use(express.json())

app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "execution-service" })
})

async function processOrder(orderId: string, command: any) {
  try {
    console.log(" Processing order:", orderId, command)

    const client = await pool.connect()
    let executedPrice = 0 // Declare executedPrice variable

    try {
      await client.query("BEGIN")

      // Get current market price (from price updates)
      executedPrice = command.type === OrderType.MARKET ? currentPrice : command.price

      if (!executedPrice || executedPrice <= 0) {
        throw new Error("Invalid execution price")
      }

      const totalCost = executedPrice * command.quantity

      // Check user balance
      const userResult = await client.query("SELECT balance, btc_balance FROM users WHERE id = $1 FOR UPDATE", [
        command.userId,
      ])

      if (userResult.rows.length === 0) {
        throw new Error("User not found")
      }

      const user = userResult.rows[0]
      const balance = Number.parseFloat(user.balance)
      const btcBalance = Number.parseFloat(user.btc_balance)

      // Validate balance
      if (command.side === OrderSide.BUY && balance < totalCost) {
        throw new Error("Insufficient balance")
      }

      if (command.side === OrderSide.SELL && btcBalance < command.quantity) {
        throw new Error("Insufficient BTC balance")
      }

      // Update user balances
      if (command.side === OrderSide.BUY) {
        await client.query("UPDATE users SET balance = balance - $1, btc_balance = btc_balance + $2 WHERE id = $3", [
          totalCost,
          command.quantity,
          command.userId,
        ])
      } else {
        await client.query("UPDATE users SET balance = balance + $1, btc_balance = btc_balance - $2 WHERE id = $3", [
          totalCost,
          command.quantity,
          command.userId,
        ])
      }

      // Update order status
      await client.query(
        "UPDATE order_commands SET status = $1, executed_price = $2, updated_at = NOW() WHERE id = $3",
        ["FILLED", executedPrice, orderId],
      )

      // Create trade record
      const tradeId = randomUUID()
      await client.query(
        "INSERT INTO trades (id, buy_order_id, sell_order_id, price, quantity, buyer_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          tradeId,
          command.side === OrderSide.BUY ? orderId : "MARKET",
          command.side === OrderSide.SELL ? orderId : "MARKET",
          executedPrice,
          command.quantity,
          command.side === OrderSide.BUY ? command.userId : "MARKET",
          command.side === OrderSide.SELL ? command.userId : "MARKET",
        ],
      )

      // Create order filled event
      await redisPub.publish(
        "order:events",
        JSON.stringify({
          type: EventType.ORDER_FILLED,
          orderId,
          userId: command.userId,
          executedPrice,
          executedQuantity: command.quantity,
        }),
      )

      // Create trade executed event
      await redisPub.publish(
        "order:events",
        JSON.stringify({
          type: EventType.TRADE_EXECUTED,
          tradeId,
          buyOrderId: command.side === OrderSide.BUY ? orderId : "MARKET",
          sellOrderId: command.side === OrderSide.SELL ? orderId : "MARKET",
          price: executedPrice,
          quantity: command.quantity,
          buyerId: command.side === OrderSide.BUY ? command.userId : "MARKET",
          sellerId: command.side === OrderSide.SELL ? command.userId : "MARKET",
        }),
      )

      await client.query("COMMIT")

      console.log(" Order executed successfully:", orderId)
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error(" Order execution failed:", error)

    // Update order status to rejected
    await pool.query("UPDATE order_commands SET status = $1, updated_at = NOW() WHERE id = $2", ["REJECTED", orderId])

    // Publish rejection event
    await redisPub.publish(
      "order:events",
      JSON.stringify({
        type: EventType.ORDER_REJECTED,
        orderId,
        reason: (error as Error).message,
      }),
    )
  }
}

async function start() {
  try {
    await redisPub.connect()
    await redisSub.connect()
    console.log("Connected to Redis")

    await redisSub.subscribe("order:commands", (message) => {
      const command = JSON.parse(message)
      const { orderId, ...rest } = command
      processOrder(orderId, rest)
    })

    await redisSub.subscribe("price:updates", (message) => {
      const priceData = JSON.parse(message)
      currentPrice = priceData.price
      // console.log(" Price updated:", currentPrice)
    })

    console.log("Subscribed to order:commands and price:updates channels")

    app.listen(PORT, () => {
      console.log(`Execution Service running on port ${PORT}`)
    })
  } catch (error) {
    console.error("Failed to start Execution Service:", error)
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
