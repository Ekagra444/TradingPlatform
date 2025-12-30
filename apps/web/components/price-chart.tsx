"use client"

import { useEffect, useRef, useState } from "react"
import { createChart, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts"
import { Button } from "@/components/ui/button"
import { CandlestickAggregator, type Timeframe } from "../lib/candlestick-aggregator"

type ChartType = "candlestick" | "line"

interface PriceChartProps {
  currentPrice: number
}

export function PriceChart({ currentPrice }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line"> | null>(null)
  const aggregatorRef = useRef<CandlestickAggregator>(new CandlestickAggregator("1m"))
  const [chartType, setChartType] = useState<ChartType>("candlestick")
  const [timeframe, setTimeframe] = useState<Timeframe>("1m")
  const lastUpdateRef = useRef<number>(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadHistoricalData = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(
          `http://localhost:4000/api/market/candlesticks?symbol=BTCUSDT&timeframe=${timeframe}&limit=500`,
        )
        if (response.ok) {
          const data = await response.json()
          
          console.log("candle data is here ")
          console.log(data);

          // Populate aggregator with historical candles converted back to price updates
          aggregatorRef.current.setTimeframe(timeframe)

          // Load historical data into aggregator
          if (data.candlesticks && data.candlesticks.length > 0) {
            data.candlesticks.forEach((candle: any) => {
              const timestamp = new Date(candle.time)
              // Add multiple price updates per candle to reconstruct it
              aggregatorRef.current.addPrice(candle.open, timestamp)
              aggregatorRef.current.addPrice(candle.close, new Date(timestamp.getTime() + 1000))
            })
          }
        }
      } catch (error) {
        console.error("Failed to load historical candlesticks:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadHistoricalData()
  }, [timeframe])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      width: containerRef.current.clientWidth,
      height: 380,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    })

    chartRef.current = chart

    const handleResize = () => {
      if (containerRef.current && chart) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (chartRef.current && seriesRef.current) {
      chartRef.current.removeSeries(seriesRef.current)
      seriesRef.current = null
      updateChart()
    }
  }, [chartType])

  useEffect(() => {
    if (currentPrice <= 0 || isLoading) return

    aggregatorRef.current.addPrice(currentPrice, new Date())

    const now = Date.now()
    if (now - lastUpdateRef.current >= 200) {
      lastUpdateRef.current = now
      updateChart()
    }
  }, [currentPrice, isLoading])

  const updateChart = () => {
    if (!chartRef.current || isLoading) return

    // const candleData = aggregatorRef.current.getCandles()
    const candleData = aggregatorRef.current.getCandles().map((c) => ({
      time: c.time,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    }));
    if (candleData.length === 0) return

    let lineData: { time: any; value: number }[] = []

    if (!seriesRef.current) {
      if (chartType === "candlestick") {
        const candleSeries = chartRef.current.addCandlestickSeries({
          upColor: "#10b981",
          downColor: "#ef4444",
          borderVisible: true,
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
        })
        candleSeries.setData(candleData as any)
        seriesRef.current = candleSeries
      } else {
        lineData = candleData.map((d) => ({
          time: d.time,
          value: d.close,
        }))
        const lineSeries = chartRef.current.addLineSeries({
          color: "#3b82f6",
          lineWidth: 2,
        })
        lineSeries.setData(lineData as any)
        seriesRef.current = lineSeries
      }
    } else {
      if (chartType === "candlestick") {
        ;(seriesRef.current as any).setData(candleData)
      } else {
        lineData = candleData.map((d) => ({
          time: d.time,
          value: d.close,
        }))
        ;(seriesRef.current as any).setData(lineData)
      }
    }

    chartRef.current.timeScale().fitContent()
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex gap-2 flex-wrap">
        <div className="flex gap-2">
          <Button
            variant={chartType === "candlestick" ? "default" : "outline"}
            size="sm"
            onClick={() => setChartType("candlestick")}
          >
            Candles
          </Button>
          <Button variant={chartType === "line" ? "default" : "outline"} size="sm" onClick={() => setChartType("line")}>
            Line
          </Button>
        </div>
        <div className="flex gap-2 border-l pl-2">
          {(["1m", "5m", "15m", "1h", "4h", "1d"] as Timeframe[]).map((tf) => (
            <Button
              key={tf}
              variant={timeframe === tf ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeframe(tf)}
              disabled={isLoading}
            >
              {tf}
            </Button>
          ))}
        </div>
      </div>
      <div
        ref={containerRef}
        className="w-full bg-card rounded-lg border border-border overflow-hidden"
        style={{ height: "380px" }}
      />
      {isLoading && <div className="text-sm text-muted-foreground text-center py-2">Loading historical data...</div>}
    </div>
  )
}
