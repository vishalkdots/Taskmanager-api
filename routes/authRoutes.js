const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { protect } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/roleMiddleware')

// helper to generate a token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, salary, designation } = req.body

    const userExists = await User.findOne({ email })
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' })
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'employee',
      salary: salary ? Number(salary) : 0,
      designation: designation || 'Developer'
    })

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      salary: user.salary,
      designation: user.designation,
      token: generateToken(user._id)
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        salary: user.salary,
        designation: user.designation,
        token: generateToken(user._id)
      })
    } else {
      res.status(401).json({ message: 'Invalid email or password' })
    }
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/auth/users — get all workspace users (protected)
router.get('/users', protect, async (req, res) => {
  try {
    const users = await User.find({}).select('name email role salary designation')
    res.json(users)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/auth/users/:id/role — update employee role, designation and salary (protected, Admin & HR)
router.put('/users/:id/role', protect, authorizeRoles('admin', 'hr'), async (req, res) => {
  try {
    const { role, salary, designation } = req.body

    const userToUpdate = await User.findById(req.params.id)
    if (!userToUpdate) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Role restrictions: HR cannot promote/demote or edit an Admin
    if (req.user.role === 'hr') {
      if (userToUpdate.role === 'admin' || role === 'admin') {
        return res.status(403).json({ message: 'HR Managers cannot modify Admin accounts.' })
      }
    }

    if (role !== undefined) userToUpdate.role = role
    if (salary !== undefined) userToUpdate.salary = Number(salary)
    if (designation !== undefined) userToUpdate.designation = designation

    await userToUpdate.save()

    res.json({
      _id: userToUpdate._id,
      name: userToUpdate.name,
      email: userToUpdate.email,
      role: userToUpdate.role,
      salary: userToUpdate.salary,
      designation: userToUpdate.designation
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/auth/users/:id/info — update employee name and email (protected, Admin & HR)
router.put('/users/:id/info', protect, authorizeRoles('admin', 'hr'), async (req, res) => {
  try {
    const { name, email } = req.body

    const userToUpdate = await User.findById(req.params.id)
    if (!userToUpdate) {
      return res.status(404).json({ message: 'User not found' })
    }

    // HR cannot edit Admin accounts
    if (req.user.role === 'hr' && userToUpdate.role === 'admin') {
      return res.status(403).json({ message: 'HR Managers cannot modify Admin accounts.' })
    }

    if (name && name.trim()) userToUpdate.name = name.trim()
    if (email && email.trim()) {
      // Check email uniqueness (exclude the current user)
      const emailExists = await User.findOne({ email: email.trim().toLowerCase(), _id: { $ne: userToUpdate._id } })
      if (emailExists) {
        return res.status(400).json({ message: 'Email address is already in use by another account.' })
      }
      userToUpdate.email = email.trim().toLowerCase()
    }

    await userToUpdate.save()

    res.json({
      _id: userToUpdate._id,
      name: userToUpdate.name,
      email: userToUpdate.email,
      role: userToUpdate.role,
      salary: userToUpdate.salary,
      designation: userToUpdate.designation
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/auth/create-user — create a new user profile (protected, Admin & HR only)
router.post('/create-user', protect, authorizeRoles('admin', 'hr'), async (req, res) => {
  try {
    const { name, email, password, role, salary, designation } = req.body
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' })
    }

    // Role restrictions: HR cannot create other Admins
    if (req.user.role === 'hr' && role === 'admin') {
      return res.status(403).json({ message: 'HR Managers cannot create administrative accounts.' })
    }

    const userExists = await User.findOne({ email })
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' })
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      salary: salary ? Number(salary) : 0,
      designation: designation || 'Developer'
    })

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      salary: user.salary,
      designation: user.designation
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router