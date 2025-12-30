interface OrderBookProps {
  orders: any[]
}

export function OrderBook({ orders }: OrderBookProps) {
  if (orders.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No orders yet</div>
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {orders.map((order) => (
        <div
          key={order.id}
          className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${order.side === "BUY" ? "text-green-600" : "text-red-600"}`}>
                {order.side}
              </span>
              <span className="text-sm text-muted-foreground">{order.quantity} BTC</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{new Date(order.createdAt).toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div
              className={`text-sm font-semibold ${
                order.status === "FILLED"
                  ? "text-green-600"
                  : order.status === "REJECTED"
                    ? "text-red-600"
                    : "text-yellow-600"
              }`}
            >
              {order.status}
            </div>
            {order.status === "FILLED" && (
              <div className="text-xs text-muted-foreground">
                ${Number.parseFloat(order.price || 0).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
