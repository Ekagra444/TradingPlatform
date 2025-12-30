import { Pool } from "pg"
import dotenv from "dotenv"
import path from "path"
import fs from "fs"

// Load .env from working directory first, then try src and parent folders as fallbacks
dotenv.config()
if (!process.env.DATABASE_URL) {
  const tryPaths = [path.resolve(__dirname, ".env"), path.resolve(__dirname, "..", ".env")]
  for (const p of tryPaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p })
      break
    }
  }
}

const connectionString = process.env.DATABASE_URL
// console.log(connectionString);
const useSsl =
  process.env.NODE_ENV === "production" ||
  !!process.env.DB_SSL ||
  (connectionString && connectionString.includes("sslmode=require"))

export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
})

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err)
})
