const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  role: {
    type: String,
    enum: ['admin', 'hr', 'accountant', 'teamleader', 'employee'],
    default: 'employee'
  },
  salary: {
    type: Number,
    default: 0
  },
  designation: {
    type: String,
    default: 'Developer'
  }
}, { timestamps: true })  // adds createdAt and updatedAt automatically

// runs BEFORE saving — hashes the password
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return  // only hash if password changed
  this.password = await bcrypt.hash(this.password, 10)
})

// method to compare passwords at login
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}

module.exports = mongoose.model('User', userSchema)