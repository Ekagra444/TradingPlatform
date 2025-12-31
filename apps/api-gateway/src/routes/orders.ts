import { Router } from "express"
import { authenticate, type AuthRequest } from "../middleware/auth"
import { pool } from "../db"
import { getRedisClient } from "../index"
import { type CreateOrderCommand, type OrderSide, OrderType } from "@trading-platform/shared"
import { randomUUID } from "crypto"

const router = Router()

router.post("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const { side, type, quantity, price } = req.body

    if (!side || !type || !quantity) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    if (type === OrderType.LIMIT && !price) {
      return res.status(400).json({ error: "Price required for limit orders" })
    }

    const orderId = randomUUID()
    const command: CreateOrderCommand = {
      userId: req.userId!,
      side: side as OrderSide,
      type: type as OrderType,
      quantity: Number.parseFloat(quantity),
      price: price ? Number.parseFloat(price) : undefined,
    }

    // Store command in database
    await pool.query(
      "INSERT INTO order_commands (id, user_id, side, type, quantity, price, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [orderId, command.userId, command.side, command.type, command.quantity, command.price, "PENDING"],
    )

    const redis = await getRedisClient()
    await redis.publish("order:commands", JSON.stringify({ orderId, ...command }))

    res.json({ orderId, status: "PENDING" })
  } catch (error) {
    console.error("Create order error:", error)
    res.status(500).json({ error: "Failed to create order" })
  }
})

router.get("/", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM order_commands WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.userId],
    )

    const orders = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      side: row.side,
      type: row.type,
      quantity: Number.parseFloat(row.quantity),
      price: row.price ? Number.parseFloat(row.price) : null,
      status: row.status,
      createdAt: row.created_at,
    }))

    res.json(orders)
  } catch (error) {
    console.error("Get orders error:", error)
    res.status(500).json({ error: "Failed to get orders" })
  }
})

router.get("/trades", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM trades WHERE buyer_id = $1 OR seller_id = $1 ORDER BY executed_at DESC LIMIT 50",
      [req.userId],
    )

    const trades = result.rows.map((row) => ({
      id: row.id,
      buyOrderId: row.buy_order_id,
      sellOrderId: row.sell_order_id,
      price: Number.parseFloat(row.price),
      quantity: Number.parseFloat(row.quantity),
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      executedAt: row.executed_at,
    }))

    res.json(trades)
  } catch (error) {
    console.error("Get trades error:", error)
    res.status(500).json({ error: "Failed to get trades" })
  }
})
router.get("/limit-orders", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM limit_orders WHERE user_id = $1 AND status != 'CANCELLED' ORDER BY created_at DESC",
      [req.userId],
    )

    const orders = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      side: row.side,
      price: Number.parseFloat(row.price),
      quantity: Number.parseFloat(row.quantity),
      filledQuantity: Number.parseFloat(row.filled_quantity),
      status: row.status,
      createdAt: row.created_at,
    }))

    res.json(orders)
  } catch (error) {
    console.error("Get limit orders error:", error)
    res.status(500).json({ error: "Failed to get limit orders" })
  }
})

router.post("/:orderId/cancel", authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderId } = req.params

    // Verify ownership
    const result = await pool.query("SELECT user_id FROM limit_orders WHERE id = $1", [orderId])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" })
    }

    if (result.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: "Unauthorized" })
    }

    // Update order status
    await pool.query("UPDATE limit_orders SET status = $1, updated_at = NOW() WHERE id = $2", ["CANCELLED", orderId])

    const redis = await getRedisClient()
    await redis.publish(
      "order:events",
      JSON.stringify({
        type: "ORDER_CANCELLED",
        orderId,
        userId: req.userId,
      }),
    )

    res.json({ message: "Order cancelled successfully" })
  } catch (error) {
    console.error("Cancel order error:", error)
    res.status(500).json({ error: "Failed to cancel order" })
  }
})

export default router
