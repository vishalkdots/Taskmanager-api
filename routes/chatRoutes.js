const express = require('express')
const router = express.Router()
const Message = require('../models/Message')
const { protect } = require('../middleware/authMiddleware')

// Protect all chat routes
router.use(protect)

// GET /api/chat — fetch last 80 global chat messages
router.get('/', async (req, res) => {
  try {
    const messages = await Message.find({ channel: 'global' })
      .sort({ createdAt: -1 })
      .limit(80)
      .populate('sender', 'name email')
    res.json(messages.reverse())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/chat/dm/:userId — fetch DM history between current user and another user
router.get('/dm/:userId', async (req, res) => {
  try {
    const myId = req.user._id
    const theirId = req.params.userId
    const messages = await Message.find({
      channel: 'dm',
      $or: [
        { sender: myId, receiver: theirId },
        { sender: theirId, receiver: myId }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('sender', 'name email')
      .populate('receiver', 'name email')
    res.json(messages)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/chat/team/:teamId — fetch team chat history
router.get('/team/:teamId', async (req, res) => {
  try {
    const messages = await Message.find({
      channel: 'team',
      teamId: req.params.teamId
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('sender', 'name email')
    res.json(messages)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
