import type { UTCTimestamp } from "lightweight-charts"

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

interface PriceUpdate {
  price: number
  timestamp: Date
}

interface Candle {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
}

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
}

export class CandlestickAggregator {
  private candles: Map<number, Candle> = new Map()
  private timeframe: Timeframe
  private priceUpdates: PriceUpdate[] = []
  private priceHistory: PriceUpdate[] = []

  constructor(timeframe: Timeframe = "1m") {
    this.timeframe = timeframe
  }

  setTimeframe(timeframe: Timeframe) {
    this.timeframe = timeframe
    this.candles.clear()
    this.rebuildCandles()
  }

  addPrice(price: number, timestamp: Date = new Date()) {
    this.priceUpdates.push({ price, timestamp })
    this.priceHistory.push({ price, timestamp })
    this.updateCandles()
  }

  private updateCandles() {
    const timeframeMs = TIMEFRAME_MS[this.timeframe]

    for (const update of this.priceUpdates) {
      const candleTime = Math.floor(update.timestamp.getTime() / timeframeMs) * timeframeMs
      const utcTime = Math.floor(new Date(candleTime).getTime() / 1000) as UTCTimestamp

      if (!this.candles.has(candleTime)) {
        this.candles.set(candleTime, {
          time: utcTime,
          open: update.price,
          high: update.price,
          low: update.price,
          close: update.price,
        })
      } else {
        const candle = this.candles.get(candleTime)!
        candle.high = Math.max(candle.high, update.price)
        candle.low = Math.min(candle.low, update.price)
        candle.close = update.price
      }
    }

    this.priceUpdates = []
  }

  private rebuildCandles() {
    const timeframeMs = TIMEFRAME_MS[this.timeframe]

    for (const update of this.priceHistory) {
      const candleTime = Math.floor(update.timestamp.getTime() / timeframeMs) * timeframeMs
      const utcTime = Math.floor(new Date(candleTime).getTime() / 1000) as UTCTimestamp

      if (!this.candles.has(candleTime)) {
        this.candles.set(candleTime, {
          time: utcTime,
          open: update.price,
          high: update.price,
          low: update.price,
          close: update.price,
        })
      } else {
        const candle = this.candles.get(candleTime)!
        candle.high = Math.max(candle.high, update.price)
        candle.low = Math.min(candle.low, update.price)
        candle.close = update.price
      }
    }
  }

  getCandles(): Candle[] {
    return Array.from(this.candles.values())
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .slice(-100) // Keep last 100 candles
  }

  getLatestCandle(): Candle | null {
    const candles = this.getCandles()
    return candles.length > 0 ? candles[candles.length - 1] : null
  }
}
