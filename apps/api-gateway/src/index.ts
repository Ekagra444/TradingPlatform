import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import dotenv from "dotenv"
import { createClient } from "redis"
import authRoutes from "./routes/auth"
import orderRoutes from "./routes/orders"
import userRoutes from "./routes/user"
import marketRoutes from "./routes/market"

let redisClient: ReturnType<typeof createClient> | null = null

export async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
    username: 'default',
    password: process.env.redisPassword,
    socket: {
        host: 'redis-19469.crce263.ap-south-1-1.ec2.cloud.redislabs.com',
        port: 19469
    }
});

    redisClient.on("error", (err) => console.error("Redis Client Error", err))
    await redisClient.connect()
  }
  return redisClient
}

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/orders", orderRoutes)
app.use("/api/user", userRoutes)
app.use("/api/market", marketRoutes)

app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "api-gateway" })
})

async function start() {
  try {
    await getRedisClient()
    console.log("Connected to Redis")

    app.listen(PORT, () => {
      console.log(`API Gateway running on port ${PORT}`)
    })
  } catch (error) {
    console.error("Failed to start API Gateway:", error)
    process.exit(1)
  }
}

process.on("SIGINT", async () => {
  console.log("Shutting down...")
  if (redisClient) {
    await redisClient.quit()
  }
  process.exit(0)
})

start()
