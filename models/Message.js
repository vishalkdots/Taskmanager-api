const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },
  channel: {
    type: String,
    enum: ['global', 'dm', 'team'],
    default: 'global'
  },
  text: {
    type: String,
    required: [true, 'Message text is required']
  }
}, { timestamps: true })

module.exports = mongoose.model('Message', messageSchema)
