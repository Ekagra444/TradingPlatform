"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { OrderBook } from "./order-book"
import { TradeHistory } from "./trade-history"
import { PriceChart } from "./price-chart"

interface TradingDashboardProps {
  user: any
  onLogout: () => void
}

export function TradingDashboard({ user, onLogout }: TradingDashboardProps) {
  const [currentPrice, setCurrentPrice] = useState(0)
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY")
  const [quantity, setQuantity] = useState("")
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<any[]>([])
  const [trades, setTrades] = useState<any[]>([])
  const [userBalance, setUserBalance] = useState({ balance: user.balance, btcBalance: user.btcBalance })
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    connectWebSocket()
    fetchOrders()
    fetchTrades()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const connectWebSocket = () => {
    const ws = new WebSocket("ws://localhost:4002")

    ws.onopen = () => {
      console.log("Connected to WebSocket")
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)

      if (message.type === "PRICE_UPDATE") {
        setCurrentPrice(message.data.price)
      } else if (message.type === "ORDER_FILLED" || message.type === "TRADE_EXECUTED") {
        fetchOrders()
        fetchTrades()
        fetchUserBalance()
      }
    }
    let first:boolean = true;
    ws.onerror = (error) => {
      if(!first){
        console.error("WebSocket error:", error)
      }
      else {
        first = !first;
      }
    }

    ws.onclose = () => {
      console.log("WebSocket closed, reconnecting...")
      setTimeout(connectWebSocket, 3000)
    }

    wsRef.current = ws
  }

  const fetchOrders = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/orders", {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setOrders(data)
      }
    } catch (error) {
      console.error("Failed to fetch orders:", error)
    }
  }

  const fetchTrades = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/orders/trades", {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setTrades(data)
      }
    } catch (error) {
      console.error("Failed to fetch trades:", error)
    }
  }

  const fetchUserBalance = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/user/me", {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setUserBalance({ balance: data.balance, btcBalance: data.btcBalance })
      }
    } catch (error) {
      console.error("Failed to fetch user balance:", error)
    }
  }

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch("http://localhost:4000/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          side: orderSide,
          type: "MARKET",
          quantity: Number.parseFloat(quantity),
          price:currentPrice
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to place order")
      }

      setQuantity("")
      fetchOrders()
    } catch (error) {
      console.error("Failed to place order:", error)
      alert((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Trading Platform</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Balance</p>
                <p className="text-lg font-semibold text-foreground">${userBalance.balance.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">BTC</p>
                <p className="text-lg font-semibold text-foreground">{userBalance.btcBalance.toFixed(8)}</p>
              </div>
              <Button variant="outline" onClick={onLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Chart */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>BTC/USDT</CardTitle>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-foreground">${currentPrice.toFixed(2)}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <PriceChart currentPrice={currentPrice} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Trades</CardTitle>
              </CardHeader>
              <CardContent>
                <TradeHistory trades={trades} />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Order Form & Order Book */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Place Order</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePlaceOrder} className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={orderSide === "BUY" ? "default" : "outline"}
                      onClick={() => setOrderSide("BUY")}
                      className={orderSide === "BUY" ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      Buy
                    </Button>
                    <Button
                      type="button"
                      variant={orderSide === "SELL" ? "default" : "outline"}
                      onClick={() => setOrderSide("SELL")}
                      className={orderSide === "SELL" ? "bg-red-600 hover:bg-red-700" : ""}
                    >
                      Sell
                    </Button>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground">Quantity (BTC)</label>
                    <Input
                      type="number"
                      step="0.00000001"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p>Market Order</p>
                    <p>Est. Total: ${(Number.parseFloat(quantity || "0") * currentPrice).toFixed(2)}</p>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading || !quantity || currentPrice === 0}>
                    {loading ? "Placing Order..." : `${orderSide} BTC`}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderBook orders={orders} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
