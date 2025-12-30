import { pool } from "./db"

export interface CandleData {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export class CandlestickAggregator {
  private prices: { price: number; timestamp: Date }[] = []
  
  constructor(private symbol = "BTCUSDT") {}
  
  addPrice(price: number, timestamp: Date) {
    this.prices.push({ price, timestamp })
  }
  
  async persistCandle(timeframe: string, openTime: Date, closeTime: Date, candle: CandleData) {
    console.log("inserting into db candlesticks table");
    try {
      await pool.query(
        `INSERT INTO candlesticks 
        (symbol, timeframe, open_time, close_time, open, high, low, close, volume) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (symbol, timeframe, open_time) 
        DO UPDATE SET 
          high = GREATEST(candlesticks.high, $6),
          low = LEAST(candlesticks.low, $7),
          close = $8,
          volume = candlesticks.volume + $9`,
        [
          this.symbol,
          timeframe,
          openTime,
          closeTime,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
        ],
      )
      console.log(`Successfully persisted ${timeframe} candle for ${this.symbol} at ${openTime.toISOString()}`)
    } catch (error) {
      console.error("Error persisting candle:", error)
    }
  }

  aggregateCandles(timeframeMs: number): Map<string, CandleData> {
    const candles = new Map<string, CandleData>()

    this.prices.forEach(({ price, timestamp }) => {
      const candleTime = Math.floor(timestamp.getTime() / timeframeMs) * timeframeMs
      const candleKey = candleTime.toString()

      const existing = candles.get(candleKey) || {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1,
      }

      candles.set(candleKey, {
        open: existing.open,
        high: Math.max(existing.high, price),
        low: Math.min(existing.low, price),
        close: price,
        volume: existing.volume + 1,
      })
    })

    return candles
  }
}
