// ================================================
// 守护 · 后端服务器
// 技术栈: Node.js + Express + SQLite
// 部署: Vercel / Railway / 云服务器 均可
// ================================================

// ─── 安装依赖 ───
// npm init -y
// npm install express better-sqlite3 cors dotenv
// node server.js

const express = require("express")
const Database = require("better-sqlite3")
const cors = require("cors")
const path = require("path")

const app = express()
app.use(express.json())
app.use(cors())

// ─── 数据库初始化 ───
// 使用绝对路径，确保部署环境（Railway/Render）下路径正确
const DB_PATH = path.join(__dirname, "guardian.db")
const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT    NOT NULL,
    lat         REAL    NOT NULL,
    lng         REAL    NOT NULL,
    accuracy    REAL,
    speed       REAL,
    altitude    REAL,
    is_sos      INTEGER DEFAULT 0,
    battery     REAL,
    network     TEXT,
    timestamp   TEXT    DEFAULT (datetime('now')),
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_device_time
    ON locations(device_id, created_at DESC);
`)

// ─── 接收孩子端上传的位置 ───
app.post("/api/location", (req, res) => {
  const { device_id, lat, lng, accuracy, speed, altitude, timestamp, is_sos, battery, network } =
    req.body

  if (!device_id || !lat || !lng) {
    return res.status(400).json({ error: "缺少必要字段" })
  }

  const stmt = db.prepare(`
    INSERT INTO locations (device_id, lat, lng, accuracy, speed, altitude, timestamp, is_sos, battery, network)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    device_id,
    lat,
    lng,
    accuracy ?? 0,
    speed ?? 0,
    altitude ?? 0,
    timestamp ?? new Date().toISOString(),
    is_sos ? 1 : 0,
    battery ?? null,
    network ?? null
  )

  console.log(
    `[${new Date().toLocaleTimeString()}] 位置收到: ${lat.toFixed(
      5
    )}, ${lng.toFixed(5)} SOS:${is_sos}`
  )

  // 如果是 SOS，这里可以接入推送通知（如极光推送、APNs）
  if (is_sos) {
    console.log("🆘 SOS 警报！设备:", device_id)
    // sendPushNotification(device_id, lat, lng); // 扩展：推送给家长
  }

  res.json({ success: true })
})

// ─── 家长端：获取最新位置 ───
app.get("/api/latest/:device_id", (req, res) => {
  const row = db
    .prepare(
      `
    SELECT * FROM locations
    WHERE device_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `
    )
    .get(req.params.device_id)

  if (!row) return res.status(404).json({ error: "设备不存在" })
  res.json(row)
})

// ─── 家长端：获取今日轨迹 ───
app.get("/api/history/:device_id", (req, res) => {
  const { date } = req.query
  const targetDate = date || new Date().toISOString().split("T")[0]

  const rows = db
    .prepare(
      `
    SELECT * FROM locations
    WHERE device_id = ?
      AND date(created_at) = ?
    ORDER BY created_at DESC
    LIMIT 200
  `
    )
    .all(req.params.device_id, targetDate)

  res.json(rows)
})

// ─── 家长端：获取所有已知设备 ───
app.get("/api/devices", (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT device_id, MAX(created_at) as last_seen, COUNT(*) as total_points
    FROM locations
    GROUP BY device_id
  `
    )
    .all()
  res.json(rows)
})

// ─── 健康检查 ───
app.get("/health", (req, res) => res.json({ status: "ok", time: new Date() }))

// ─── 启动 ───
const PORT = process.env.PORT || 5370
app.listen(PORT, () => {
  console.log(`✅ 守护服务器运行在 http://localhost:${PORT}`)
  console.log(`📍 接收位置: POST /api/location`)
  console.log(`👀 查看位置: GET  /api/latest/:device_id`)
  console.log(`📅 历史轨迹: GET  /api/history/:device_id?date=2026-02-25`)
})
