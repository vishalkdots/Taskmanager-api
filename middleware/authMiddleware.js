const jwt = require('jsonwebtoken')
const User = require('../models/User')

const protect = async (req, res, next) => {
  let token

  // JWT is sent in the Authorization header as: "Bearer <token>"
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1]  // grab just the token part

      const decoded = jwt.verify(token, process.env.JWT_SECRET)  // verify + decode

      // attach the user to the request (minus password)
      req.user = await User.findById(decoded.id).select('-password')

      next()  // move to the actual route handler
    } catch (error) {
      res.status(401).json({ message: 'Not authorized, token failed' })
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' })
  }
}

module.exports = { protect }