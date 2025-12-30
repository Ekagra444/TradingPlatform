import express from "express"
import { pool } from "../db"

const router = express.Router()

// Get historical candlesticks
router.get("/candlesticks", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", timeframe = "1m", limit = 500 } = req.query
    
    // extracting latest time candlestick 
    const result = await pool.query(
      `SELECT 
        open_time as time,
        open,
        high,
        low,
        close,
        volume
      FROM candlesticks
      WHERE symbol = $1 AND timeframe = $2
      ORDER BY open_time DESC
      LIMIT $3`,
      [symbol, timeframe, Math.min(Number(limit), 1000)],
    )

    // Return in ascending order (oldest to newest)
    res.json({
      symbol,
      timeframe,
      candlesticks: result.rows.reverse(),
    })
  } catch (error) {
    console.error("Error fetching candlesticks:", error)
    res.status(500).json({ error: "Failed to fetch candlesticks" })
  }
})

export default router
