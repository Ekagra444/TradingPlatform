interface TradeHistoryProps {
  trades: any[]
}

export function TradeHistory({ trades }: TradeHistoryProps) {
  if (trades.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No trades yet</div>
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {trades.map((trade) => (
        <div
          key={trade.id}
          className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
        >
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">
              {trade.quantity} BTC @ ${Number.parseFloat(trade.price).toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{new Date(trade.executedAt).toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">
              ${(Number.parseFloat(trade.price) * Number.parseFloat(trade.quantity)).toFixed(2)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
