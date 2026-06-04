const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const dotenv = require('dotenv')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('path')
const os = require('os')
const connectDB = require('./config/db')
const Message = require('./models/Message')
const { errorHandler, notFound } = require('./middleware/errorMiddleware')

// Load environment variables
dotenv.config()

// Connect database
connectDB()

const app = express()
const httpServer = http.createServer(app)

// Security Headers (configured with cross-origin policies for React dev)
app.use(helmet({
  crossOriginResourcePolicy: false,
}))

// Rate Limiting to prevent brute-force attacks
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
})
app.use('/api/', apiLimiter)

// CORS setup
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://taskmanager-kappa-self.vercel.app'
  ],
  credentials: true
}))

// Parse JSON and URL-encoded bodies
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Static uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// API Routes
app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/tasks', require('./routes/taskRoutes'))
app.use('/api/chat', require('./routes/chatRoutes'))
app.use('/api/financials', require('./routes/financialRoutes'))
app.use('/api/teams', require('./routes/teamRoutes'))
app.use('/api/projects', require('./routes/projectRoutes'))

// Health check and root route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'TaskFlow Live & API Lab Backend Server running',
    environment: process.env.NODE_ENV || 'development',
    systemTime: new Date()
  })
})

// Error Middlewares
app.use(notFound)
app.use(errorHandler)

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: [
    'http://localhost:5173',
    'https://taskmanager-kappa-self.vercel.app'
  ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
})

// Track active socket connections and user presence
const activeUsers = new Map() // socket.id -> user profile info
const systemActivityLog = []

const pushActivityLog = (type, message, user = 'System') => {
  const logEntry = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message,
    user
  }
  systemActivityLog.push(logEntry)
  if (systemActivityLog.length > 50) systemActivityLog.shift()
  io.emit('system:activity', logEntry)
}

// CPU stats helper for live telemetry
function getCpuStats() {
  const cpus = os.cpus()
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0
  for (const cpu of cpus) {
    user += cpu.times.user
    nice += cpu.times.nice
    sys += cpu.times.sys
    idle += cpu.times.idle
    irq += cpu.times.irq
  }
  const total = user + nice + sys + idle + irq
  return { idle, total }
}

let lastCpuStats = getCpuStats()

function getCpuUsage(callback) {
  const stats1 = lastCpuStats
  const stats2 = getCpuStats()
  lastCpuStats = stats2

  const idle = stats2.idle - stats1.idle
  const total = stats2.total - stats1.total
  if (total === 0) return callback(0)
  const percent = 100 - Math.round((100 * idle) / total)
  callback(Math.max(0, Math.min(100, percent)))
}

io.on('connection', (socket) => {
  console.log('Socket Client connected:', socket.id)
  pushActivityLog('connection', `Client joined workspace: ID [${socket.id.substring(0, 6)}...]`)

  // Sync active presence list on connect
  socket.emit('presence:list', Array.from(activeUsers.values()))
  socket.emit('system:history', systemActivityLog)

  // Handle user signing in and setting presence
  socket.on('presence:join', async (userData) => {
    if (userData && userData.email) {
      activeUsers.set(socket.id, {
        socketId: socket.id,
        _id: userData._id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        designation: userData.designation,
        joinedAt: new Date()
      })
      io.emit('presence:list', Array.from(activeUsers.values()))
      pushActivityLog('presence', `${userData.name} (${userData.role}) is online`, userData.name)

      // Join socket rooms for all teams they are part of
      try {
        const Team = require('./models/Team')
        const teams = await Team.find({
          $or: [
            { leader: userData._id },
            { members: userData._id }
          ]
        })
        for (const team of teams) {
          socket.join(`team:${team._id}`)
          console.log(`Socket ${socket.id} joined room team:${team._id}`)
        }
      } catch (err) {
        console.error('Error joining team rooms:', err)
      }
    }
  })

  // Team leader notification broadcast
  socket.on('notification:send', (data) => {
    const { teamId, title, message, senderName } = data
    if (!teamId || !message) return

    // Broadcast to the team room
    io.to(`team:${teamId}`).emit('notification:receive', {
      title: title || 'Team Announcement',
      message,
      senderName,
      timestamp: new Date().toLocaleTimeString()
    })

    pushActivityLog('presence', `[Alert] Broadcast to team: "${message.substring(0, 30)}..."`, senderName)
  })

  // Task creation socket bridge
  socket.on('task:create', (task) => {
    io.emit('task:update', { action: 'create', task })
    const userName = task.user && typeof task.user === 'object' ? task.user.name : 'A user'
    pushActivityLog('task', `Created task: "${task.title}"`, userName)
  })

  // Task change socket bridge
  socket.on('task:update', (task) => {
    io.emit('task:update', { action: 'update', task })
    pushActivityLog('task', `Updated task: "${task.title}" (Status: ${task.status})`)
  })

  // Task deletion socket bridge
  socket.on('task:delete', ({ taskId, title, userName }) => {
    io.emit('task:removed', taskId)
    pushActivityLog('task', `Deleted task: "${title}"`, userName || 'A user')
  })

  // Client manual testing logging (via API explorer or test buttons)
  socket.on('client:log', (logMessage) => {
    pushActivityLog('api-test', logMessage.message, logMessage.user || 'API Explorer')
  })

  // Global workspace chat
  socket.on('chat:message', async (messageData) => {
    try {
      const userObj = activeUsers.get(socket.id)
      if (!userObj) return

      const msg = await Message.create({
        sender: userObj._id,
        text: messageData.text,
        channel: 'global'
      })

      const populatedMsg = await Message.findById(msg._id).populate('sender', 'name email')
      io.emit('chat:message', populatedMsg)
      pushActivityLog('chat', `[Global] ${userObj.name}: "${messageData.text.substring(0, 30)}${messageData.text.length > 30 ? '...' : ''}"`, userObj.name)
    } catch (err) {
      console.error('Socket chat error:', err)
    }
  })

  // Personal Direct Messages — stored and sent only to the target user's socket
  socket.on('dm:send', async ({ toUserId, text }) => {
    try {
      const senderObj = activeUsers.get(socket.id)
      if (!senderObj || !text || !toUserId) return

      const msg = await Message.create({
        sender: senderObj._id,
        receiver: toUserId,
        text,
        channel: 'dm'
      })

      const populated = await Message.findById(msg._id).populate('sender', 'name email').populate('receiver', 'name email')

      // Send to sender's own socket (so they see it)
      socket.emit('dm:receive', populated)

      // Find receiver's socket and deliver
      for (const [sid, u] of activeUsers.entries()) {
        if (u._id && u._id.toString() === toUserId.toString()) {
          io.to(sid).emit('dm:receive', populated)
          break
        }
      }
    } catch (err) {
      console.error('DM send error:', err)
    }
  })

  // Team chat — broadcast to all team room members
  socket.on('team:chat:send', async ({ teamId, text }) => {
    try {
      const senderObj = activeUsers.get(socket.id)
      if (!senderObj || !text || !teamId) return

      const msg = await Message.create({
        sender: senderObj._id,
        teamId,
        text,
        channel: 'team'
      })

      const populated = await Message.findById(msg._id).populate('sender', 'name email')
      io.to(`team:${teamId}`).emit('team:chat:receive', populated)
    } catch (err) {
      console.error('Team chat error:', err)
    }
  })

  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id)
    if (user) {
      pushActivityLog('presence', `${user.name} went offline`, user.name)
      activeUsers.delete(socket.id)
      io.emit('presence:list', Array.from(activeUsers.values()))
    } else {
      pushActivityLog('connection', `Client disconnected: ID [${socket.id.substring(0, 6)}...]`)
    }
    console.log('Socket Client disconnected:', socket.id)
  })
})

// Stream Server telemetry stats every 3 seconds
setInterval(() => {
  getCpuUsage((cpuPercent) => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const memPercent = Math.round((usedMem / totalMem) * 100)

    io.emit('system:telemetry', {
      cpu: cpuPercent,
      memory: memPercent,
      uptime: os.uptime(),
      freeMemGb: (freeMem / (1024 * 1024 * 1024)).toFixed(2),
      totalMemGb: (totalMem / (1024 * 1024 * 1024)).toFixed(2),
      activeConnections: io.engine.clientsCount,
      timestamp: new Date().toLocaleTimeString()
    })
  })
}, 3000)

const PORT = process.env.PORT || 5000
httpServer.listen(PORT, () => {
  console.log(`TaskFlow Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`)
})
