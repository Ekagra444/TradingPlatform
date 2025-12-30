import { Router } from "express"
import { authenticate, type AuthRequest } from "../middleware/auth"
import { pool } from "../db"

const router = Router()

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query("SELECT id, email, balance, btc_balance, created_at FROM users WHERE id = $1", [
      req.userId,
    ])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" })
    }

    const user = result.rows[0]
    res.json({
      id: user.id,
      email: user.email,
      balance: Number.parseFloat(user.balance),
      btcBalance: Number.parseFloat(user.btc_balance),
      createdAt: user.created_at,
    })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ error: "Failed to get user" })
  }
})

export default router
