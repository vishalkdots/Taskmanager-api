const express = require('express')
const router = express.Router()
const Project = require('../models/Project')
const { protect } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/roleMiddleware')

// Protect all project routes
router.use(protect)

// GET /api/projects — Fetch all projects (accessible by all authenticated staff)
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find()
      .populate({
        path: 'assignedTeam',
        populate: {
          path: 'members leader',
          select: 'name email role'
        }
      })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
    
    res.json(projects)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/projects — Create a new project (accessible by admin, hr, and teamleader)
router.post('/', authorizeRoles('admin', 'hr', 'teamleader'), async (req, res) => {
  try {
    const { name, description, client, budget, assignedTeam } = req.body
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Project name is required' })
    }

    const project = await Project.create({
      name,
      description: description || '',
      client: client || '',
      budget: budget ? Number(budget) : 0,
      assignedTeam: assignedTeam || null,
      createdBy: req.user._id
    })

    const populated = await Project.findById(project._id)
      .populate({
        path: 'assignedTeam',
        populate: {
          path: 'members leader',
          select: 'name email role'
        }
      })
      .populate('createdBy', 'name email')

    res.status(201).json(populated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/projects/:id — Update a project (accessible by admin, hr, and teamleader)
router.put('/:id', authorizeRoles('admin', 'hr', 'teamleader'), async (req, res) => {
  try {
    const { name, description, client, budget, assignedTeam, status } = req.body

    const project = await Project.findById(req.params.id)
    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    if (name !== undefined) project.name = name
    if (description !== undefined) project.description = description
    if (client !== undefined) project.client = client
    if (budget !== undefined) project.budget = Number(budget)
    if (assignedTeam !== undefined) project.assignedTeam = assignedTeam || null
    if (status !== undefined) project.status = status

    await project.save()

    const populated = await Project.findById(project._id)
      .populate({
        path: 'assignedTeam',
        populate: {
          path: 'members leader',
          select: 'name email role'
        }
      })
      .populate('createdBy', 'name email')

    res.json(populated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// DELETE /api/projects/:id — Delete a project (accessible by admin only)
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    // Optionally disassociate tasks
    const Task = require('../models/Task')
    await Task.updateMany({ project: project._id }, { project: null })

    await project.deleteOne()
    res.json({ message: 'Project deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
