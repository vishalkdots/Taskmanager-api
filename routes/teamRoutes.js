const express = require('express')
const router = express.Router()
const Team = require('../models/Team')
const { protect } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/roleMiddleware')

// Protect all team routes
router.use(protect)

// GET /api/teams — Fetch teams (admin & hr see all, others see their own)
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id
    const role = req.user.role

    const query = (role === 'admin' || role === 'hr')
      ? {}
      : { $or: [{ leader: userId }, { members: userId }] }

    const teams = await Team.find(query)
      .populate('leader', 'name email role designation')
      .populate('members', 'name email role designation')

    res.json(teams)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/teams — Create a team (Admin, HR, and Team Leaders)
router.post('/', authorizeRoles('admin', 'hr', 'teamleader'), async (req, res) => {
  try {
    const { name, members } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Team name is required' })
    }

    const team = await Team.create({
      name,
      members: members || [],
      leader: req.user._id
    })

    const populated = await Team.findById(team._id)
      .populate('leader', 'name email role designation')
      .populate('members', 'name email role designation')

    res.status(201).json(populated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/teams/:id — Edit team name and members (Admin, HR, or the team's own leader)
router.put('/:id', authorizeRoles('admin', 'hr', 'teamleader'), async (req, res) => {
  try {
    const { name, members } = req.body
    const team = await Team.findById(req.params.id)

    if (!team) {
      return res.status(404).json({ message: 'Team not found' })
    }

    // Team leaders can only edit their own team
    if (req.user.role === 'teamleader' && team.leader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only edit teams you lead.' })
    }

    if (name && name.trim()) team.name = name.trim()
    if (members !== undefined) team.members = members

    await team.save()

    const populated = await Team.findById(team._id)
      .populate('leader', 'name email role designation')
      .populate('members', 'name email role designation')

    res.json(populated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// DELETE /api/teams/:id — Delete a team (Admin, HR, or team leader for own team)
router.delete('/:id', authorizeRoles('admin', 'hr', 'teamleader'), async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)

    if (!team) {
      return res.status(404).json({ message: 'Team not found' })
    }

    // Team leaders can only delete their own team
    if (req.user.role === 'teamleader' && team.leader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete teams you lead.' })
    }

    await team.deleteOne()
    res.json({ message: 'Team deleted successfully', id: req.params.id })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
