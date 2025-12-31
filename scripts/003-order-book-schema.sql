-- Create table to store order book depth data
CREATE TABLE IF NOT EXISTS order_book_depth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL, -- 'BID' or 'ASK'
  price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create table for limit orders
CREATE TABLE IF NOT EXISTS limit_orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  side VARCHAR(10) NOT NULL,
  price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  filled_quantity DECIMAL(20, 8) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'OPEN',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create table for chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  username VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'USER', -- 'USER' or 'SYSTEM'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_book_depth_symbol_side ON order_book_depth(symbol, side);
CREATE INDEX IF NOT EXISTS idx_limit_orders_user_id ON limit_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_limit_orders_status ON limit_orders(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_symbol ON chat_messages(symbol);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
