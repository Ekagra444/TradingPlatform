-- Create candlesticks table for storing OHLC data
CREATE TABLE IF NOT EXISTS candlesticks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  timeframe VARCHAR(10) NOT NULL,
  open_time TIMESTAMP NOT NULL,
  close_time TIMESTAMP NOT NULL,
  open DECIMAL(20, 8) NOT NULL,
  high DECIMAL(20, 8) NOT NULL,
  low DECIMAL(20, 8) NOT NULL,
  close DECIMAL(20, 8) NOT NULL,
  volume DECIMAL(20, 8) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(symbol, timeframe, open_time)
);

-- Create index for efficient lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_candlesticks_symbol_timeframe_time 
  ON candlesticks(symbol, timeframe, open_time DESC);
CREATE INDEX IF NOT EXISTS idx_candlesticks_created_at 
  ON candlesticks(created_at DESC);

-- Function to clean up candlesticks older than 1 month
CREATE OR REPLACE FUNCTION cleanup_old_candlesticks() RETURNS void AS $$
BEGIN
  DELETE FROM candlesticks WHERE created_at < NOW() - INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql;
