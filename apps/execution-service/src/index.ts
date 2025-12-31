import express from "express"
import dotenv from "dotenv"
import { createClient } from "redis"
import { pool } from "./db"
import { EventType, OrderSide, OrderType } from "@trading-platform/shared"
import { randomUUID } from "crypto"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4001

// ---Redis Connection--- 
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

let orderBook = { bids: [], asks: [] }

app.use(express.json())

app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "execution-service" })
})

async function checkAndFillLimitOrders(price: number) {
  try {
    // Check BUY limit orders (fill when price drops below limit)
    const buyOrders = await pool.query(
      "SELECT * FROM limit_orders WHERE side = 'BUY' AND status = 'OPEN' AND price >= $1",
      [price],
    )

    for (const order of buyOrders.rows) {
      await fillLimitOrder(order, price)
    }

    // Check SELL limit orders (fill when price rises above limit)
    const sellOrders = await pool.query(
      "SELECT * FROM limit_orders WHERE side = 'SELL' AND status = 'OPEN' AND price <= $1",
      [price],
    )

    for (const order of sellOrders.rows) {
      await fillLimitOrder(order, price)
    }
  } catch (error) {
    console.error("Error checking limit orders:", error)
  }
}

async function fillLimitOrder(order: any, executedPrice: number) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const quantity = Number.parseFloat(order.quantity)
    const filledQuantity = Number.parseFloat(order.filled_quantity)
    const remainingQuantity = quantity - filledQuantity
    const totalCost = executedPrice * remainingQuantity

    // Get user balance
    const userResult = await client.query("SELECT balance, btc_balance FROM users WHERE id = $1 FOR UPDATE", [
      order.user_id,
    ])

    if (userResult.rows.length === 0) throw new Error("User not found")

    const user = userResult.rows[0]
    const balance = Number.parseFloat(user.balance)
    const btcBalance = Number.parseFloat(user.btc_balance)

    // Validate balance
    if (order.side === OrderSide.BUY && balance < totalCost) {
      throw new Error("Insufficient balance")
    }

    if (order.side === OrderSide.SELL && btcBalance < remainingQuantity) {
      throw new Error("Insufficient BTC balance")
    }

    // Update balances
    if (order.side === OrderSide.BUY) {
      await client.query("UPDATE users SET balance = balance - $1, btc_balance = btc_balance + $2 WHERE id = $3", [
        totalCost,
        remainingQuantity,
        order.user_id,
      ])
    } else {
      await client.query("UPDATE users SET balance = balance + $1, btc_balance = btc_balance - $2 WHERE id = $3", [
        totalCost,
        remainingQuantity,
        order.user_id,
      ])
    }

    // Update limit order
    await client.query(
      "UPDATE limit_orders SET filled_quantity = quantity, status = 'FILLED', updated_at = NOW() WHERE id = $1",
      [order.id],
    )

    // Create trade record
    const tradeId = randomUUID()
    await client.query(
      "INSERT INTO trades (id, buy_order_id, sell_order_id, price, quantity, buyer_id, seller_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [
        tradeId,
        order.side === OrderSide.BUY ? order.id : "LIMIT_ORDER",
        order.side === OrderSide.SELL ? order.id : "LIMIT_ORDER",
        executedPrice,
        remainingQuantity,
        order.side === OrderSide.BUY ? order.user_id : "LIMIT_ORDER",
        order.side === OrderSide.SELL ? order.user_id : "LIMIT_ORDER",
      ],
    )

    // Publish events
    await redisPub.publish(
      "order:events",
      JSON.stringify({
        type: EventType.ORDER_FILLED,
        orderId: order.id,
        userId: order.user_id,
        executedPrice,
        executedQuantity: remainingQuantity,
      }),
    )

    await client.query("COMMIT")
    console.log(`Filled limit order ${order.id} at price ${executedPrice}`)
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Error filling limit order:", error)
  } finally {
    client.release()
  }
}

async function processOrder(orderId: string, command: any) {
  try {
    console.log(" Processing order:", orderId, command)
    // If limit order, store it and don't execute immediately
    if (command.type === OrderType.LIMIT) {
      await pool.query(
        "INSERT INTO limit_orders (id, user_id, side, price, quantity, status) VALUES ($1, $2, $3, $4, $5, $6)",
        [orderId, command.userId, command.side, command.price, command.quantity, "OPEN"],
      )

      await redisPub.publish(
        "order:events",
        JSON.stringify({
          type: EventType.ORDER_PLACED,
          orderId,
          userId: command.userId,
          orderType: OrderType.LIMIT,
          price: command.price,
          quantity: command.quantity,
        }),
      )

      console.log(`Limit order ${orderId} placed at price ${command.price}`)
      return
    }

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
      checkAndFillLimitOrders(currentPrice)
    })

    await redisSub.subscribe("order-book:update", (message) => {

      const bookData = JSON.parse(message)

      orderBook = bookData

    })

    console.log("Subscribed to order:commands, price:updates, and order-book:update channels")

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
