import { WebSocket } from "ws"
import { pool } from "./db"


class Heap {
  private data: number[] = []
  private comparator: (a: number, b: number) => boolean

  constructor(comparator: (a: number, b: number) => boolean) {
    this.comparator = comparator
  }

  peek(): number | null {
    return this.data.length ? this.data[0] : null
  }

  push(value: number) {
    this.data.push(value)
    this.bubbleUp()
  }

  pop(): number | null {
    if (!this.data.length) return null
    const top = this.data[0]
    const last = this.data.pop()!
    if (this.data.length) {
      this.data[0] = last
      this.bubbleDown()
    }
    return top
  }

  private bubbleUp() {
    let i = this.data.length - 1
    while (i > 0) {
      const p = Math.floor((i - 1) / 2)
      if (this.comparator(this.data[p], this.data[i])) break
      ;[this.data[p], this.data[i]] = [this.data[i], this.data[p]]
      i = p
    }
  }

  private bubbleDown() {
    let i = 0
    while (true) {
      let left = 2 * i + 1
      let right = 2 * i + 2
      let best = i

      if (left < this.data.length && !this.comparator(this.data[best], this.data[left])) {
        best = left
      }
      if (right < this.data.length && !this.comparator(this.data[best], this.data[right])) {
        best = right
      }
      if (best === i) break
      ;[this.data[i], this.data[best]] = [this.data[best], this.data[i]]
      i = best
    }
  }
}

interface OrderBookLevel {
  price: number
  quantity: number
}

interface OrderBook {
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  lastUpdateId: number
}
export class OrderBookManager {
  private bidsMap = new Map<number, number>()
  private asksMap = new Map<number, number>()

  private bidHeap = new Heap((a, b) => a > b) // max-heap
  private askHeap = new Heap((a, b) => a < b) // min-heap

  private lastUpdateId = 0
  private symbol: string

  constructor(symbol = "BTCUSDT") {
    this.symbol = symbol
  }

  // INITIAL SNAPSHOT 

  async initialize() {
    try {
      type BinanceLevel = [string, string]

      interface BinanceDepthResponse {
        lastUpdateId: number
        bids: BinanceLevel[]
        asks: BinanceLevel[]
      }

      const res = await fetch(
        `https://api.binance.com/api/v3/depth?symbol=${this.symbol}&limit=20`
      )
      const data = (await res.json()) as BinanceDepthResponse

      this.lastUpdateId = data.lastUpdateId

      // reset state
      this.bidsMap.clear()
      this.asksMap.clear()

      for (const [p, q] of data.bids) {
        const price = +p
        const qty = +q
        this.bidsMap.set(price, qty)
        this.bidHeap.push(price)
      }

      for (const [p, q] of data.asks) {
        const price = +p
        const qty = +q
        this.asksMap.set(price, qty)
        this.askHeap.push(price)
      }

      await this.persistOrderBook()
      console.log("Order book initialized")
    } catch (err) {
      console.error("Failed to initialize order book:", err)
    }
  }

  // ---------------- STREAM ----------------

  connectDepthStream() {
    const ws = new WebSocket(
      `wss://stream.binance.com:9443/ws/${this.symbol.toLowerCase()}@depth@100ms`
    )

    ws.on("message", async (data: Buffer) => {
      try {
        const update = JSON.parse(data.toString())

        // discard stale updates
        if (update.U <= this.lastUpdateId) return

        this.lastUpdateId = update.u

        this.applyUpdates(update.b, this.bidsMap, this.bidHeap)
        this.applyUpdates(update.a, this.asksMap, this.askHeap)

        await this.persistOrderBook()
      } catch (err) {
        console.error("Depth update error:", err)
      }
    })

    ws.on("close", () => {
      console.warn("Depth stream closed. Reconnecting...")
      setTimeout(() => this.connectDepthStream(), 5000)
    })

    ws.on("error", (err) => {
      console.error("WebSocket error:", err)
    })
  }

  // ---------------- UPDATE LOGIC ----------------

  private applyUpdates(
    updates: [string, string][],
    map: Map<number, number>,
    heap: Heap
  ) {
    for (const [p, q] of updates) {
      const price = +p
      const qty = +q

      if (qty === 0) {
        map.delete(price)
      } else {
        if (!map.has(price)) {
          heap.push(price)
        }
        map.set(price, qty)
      }
    }
  }

  // ---------------- PERSISTENCE ----------------

  private async persistOrderBook() {
    try {
      await pool.query(
        "DELETE FROM order_book_depth WHERE symbol = $1",
        [this.symbol]
      )

      for (const [price, quantity] of this.bidsMap) {
        await pool.query(
          "INSERT INTO order_book_depth (symbol, side, price, quantity) VALUES ($1,$2,$3,$4)",
          [this.symbol, "BID", price, quantity]
        )
      }

      for (const [price, quantity] of this.asksMap) {
        await pool.query(
          "INSERT INTO order_book_depth (symbol, side, price, quantity) VALUES ($1,$2,$3,$4)",
          [this.symbol, "ASK", price, quantity]
        )
      }
    } catch (err) {
      console.error("Persist failed:", err)
    }
  }

  // ---------------- READ API ----------------

  getOrderBook(): OrderBook {
    const bids = [...this.bidsMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, 20)
      .map(([price, quantity]) => ({ price, quantity }))

    const asks = [...this.asksMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 20)
      .map(([price, quantity]) => ({ price, quantity }))

    return {
      bids,
      asks,
      lastUpdateId: this.lastUpdateId,
    }
  }

  getBestBid(): number | null {
    while (true) {
      const price = this.bidHeap.peek()
      if (price === null) return null
      if (this.bidsMap.has(price)) return price
      this.bidHeap.pop()
    }
  }

  getBestAsk(): number | null {
    while (true) {
      const price = this.askHeap.peek()
      if (price === null) return null
      if (this.asksMap.has(price)) return price
      this.askHeap.pop()
    }
  }
}
