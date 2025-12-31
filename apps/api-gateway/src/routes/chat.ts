import { Router } from "express"
import { authenticate, type AuthRequest } from "../middleware/auth"
import { pool } from "../db"
import { getRedisClient } from "../index"
import { randomUUID } from "crypto"

const router = Router()

// Get chat messages for a symbol
router.get("/:symbol", async (req: AuthRequest, res) => {
  try {
    const { symbol } = req.params
    const limit = req.query.limit ? Number.parseInt(req.query.limit as string) : 100

    const result = await pool.query(
      "SELECT id, user_id, username, message, message_type, created_at FROM chat_messages WHERE symbol = $1 ORDER BY created_at DESC LIMIT $2",
      [symbol.toUpperCase(), limit],
    )

    const messages = result.rows.reverse().map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      message: row.message,
      messageType: row.message_type,
      createdAt: row.created_at,
    }))

    res.json(messages)
  } catch (error) {
    console.error("Get chat messages error:", error)
    res.status(500).json({ error: "Failed to get chat messages" })
  }
})

// Send chat message
router.post("/:symbol", authenticate, async (req: AuthRequest, res) => {
  try {
    const { symbol } = req.params
    const { message } = req.body

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: "Message cannot be empty" })
    }

    if (message.length > 500) {
      return res.status(400).json({ error: "Message too long" })
    }

    // Get user email for username
    const userResult = await pool.query("SELECT email FROM users WHERE id = $1", [req.userId])
    const username = userResult.rows[0]?.email?.split("@")[0] || "Anonymous"

    const messageId = randomUUID()

    // Save to database
    await pool.query(
      "INSERT INTO chat_messages (id, symbol, user_id, username, message, message_type) VALUES ($1, $2, $3, $4, $5, $6)",
      [messageId, symbol.toUpperCase(), req.userId, username, message, "USER"],
    )

    // Broadcast to WebSocket clients
    const redis = await getRedisClient()
    await redis.publish(
      `chat:${symbol.toUpperCase()}`,
      JSON.stringify({
        type: "CHAT_MESSAGE",
        id: messageId,
        userId: req.userId,
        username,
        message,
        messageType: "USER",
        createdAt: new Date(),
      }),
    )

    res.json({ messageId, success: true })
  } catch (error) {
    console.error("Send chat message error:", error)
    res.status(500).json({ error: "Failed to send message" })
  }
})

export default router
