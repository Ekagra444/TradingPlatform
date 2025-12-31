// Order Types
export enum OrderSide {
  BUY = "BUY",
  SELL = "SELL",
}

export enum OrderStatus {
  PENDING = "PENDING",
  FILLED = "FILLED",
  CANCELLED = "CANCELLED",
  REJECTED = "REJECTED",
}

export enum OrderType {
  MARKET = "MARKET",
  LIMIT = "LIMIT",
}

export interface Order {
  id: string
  userId: string
  side: OrderSide
  type: OrderType
  quantity: number
  price?: number
  status: OrderStatus
  createdAt: Date
  updatedAt: Date
}

export interface CreateOrderCommand {
  userId: string
  side: OrderSide
  type: OrderType
  quantity: number
  price?: number
}

// Event Types
export enum EventType {
  ORDER_CREATED = "ORDER_CREATED",
  ORDER_FILLED = "ORDER_FILLED",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  ORDER_REJECTED = "ORDER_REJECTED",
  TRADE_EXECUTED = "TRADE_EXECUTED",
  PRICE_UPDATE = "PRICE_UPDATE",
  ORDER_PLACED="ORDER_PLACED"
}

export interface BaseEvent {
  id: string
  type: EventType
  timestamp: Date
  data: unknown
}

export interface OrderCreatedEvent extends BaseEvent {
  type: EventType.ORDER_CREATED
  data: {
    orderId: string
    userId: string
    side: OrderSide
    type: OrderType
    quantity: number
    price?: number
  }
}

export interface OrderFilledEvent extends BaseEvent {
  type: EventType.ORDER_FILLED
  data: {
    orderId: string
    userId: string
    executedPrice: number
    executedQuantity: number
  }
}

export interface TradeExecutedEvent extends BaseEvent {
  type: EventType.TRADE_EXECUTED
  data: {
    tradeId: string
    buyOrderId: string
    sellOrderId: string
    price: number
    quantity: number
    buyerId: string
    sellerId: string
  }
}

export interface PriceUpdateEvent extends BaseEvent {
  type: EventType.PRICE_UPDATE
  data: {
    symbol: string
    price: number
    volume: number
  }
}

// Trade Types
export interface Trade {
  id: string
  buyOrderId: string
  sellOrderId: string
  price: number
  quantity: number
  buyerId: string
  sellerId: string
  executedAt: Date
}

// User Types
export interface User {
  id: string
  email: string
  balance: number
  btcBalance: number
  createdAt: Date
}

// WebSocket Message Types
export interface WSMessage {
  type: string
  payload: unknown
}

// Market Data Types
export interface MarketData {
  symbol: string
  price: number
  high24h: number
  low24h: number
  volume24h: number
  priceChange24h: number
  timestamp: Date
}
