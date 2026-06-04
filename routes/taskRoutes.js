const express = require('express')
const router = express.Router()
const Task = require('../models/Task')
const { protect } = require('../middleware/authMiddleware')
const upload = require('../middleware/multer')

// ALL routes below are protected — user must send a valid JWT
router.use(protect)

// GET /api/tasks — get tasks created by or assigned to this user
router.get('/', async (req, res) => {
  try {
    const tasks = await Task.find({
      $or: [
        { user: req.user._id },
        { assignedTo: req.user._id }
      ]
    })
      .populate('assignedTo', 'name email')
      .populate('user', 'name email')
      .populate('project', 'name status')
    
    res.json(tasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/tasks — create a task
router.post('/', async (req, res) => {
  try {
    const { title, description, priority, category, assignedTo, project } = req.body

    const task = await Task.create({
      title,
      description,
      priority: priority || 'medium',
      category: category || 'Feature',
      assignedTo: assignedTo || null,
      project: project || null,
      user: req.user._id  // from the JWT middleware
    })

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('user', 'name email')
      .populate('project', 'name status')

    res.status(201).json(populated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/tasks/:id/upload — upload file attachment to task
router.post('/:id/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const task = await Task.findById(req.params.id)
    if (!task) {
      return res.status(404).json({ message: 'Task not found' })
    }

    // Check ownership or assignment
    const isCreator = task.user.toString() === req.user._id.toString()
    const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user._id.toString()
    if (!isCreator && !isAssignee) {
      return res.status(403).json({ message: 'Not allowed' })
    }

    const newAttachment = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: `/uploads/${req.file.filename}`,
      size: req.file.size
    }

    task.attachments.push(newAttachment)
    await task.save()

    const populated = await Task.findById(task._id)
      .populate('assignedTo', 'name email')
      .populate('user', 'name email')

    res.json(populated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/tasks/:id — update a task
router.put('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)

    if (!task) return res.status(404).json({ message: 'Task not found' })

    // Check ownership or assignment
    const isCreator = task.user.toString() === req.user._id.toString()
    const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user._id.toString()
    if (!isCreator && !isAssignee) {
      return res.status(403).json({ message: 'Not allowed' })
    }

    const updated = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('assignedTo', 'name email')
      .populate('user', 'name email')
      .populate('project', 'name status')

    // Automatic Project status update logic
    if (updated.project) {
      const Project = require('../models/Project')
      const projectTasks = await Task.find({ project: updated.project })
      const allDone = projectTasks.length > 0 && projectTasks.every((t) => t.status === 'done')
      const someInProgress = projectTasks.some((t) => t.status === 'in-progress' || t.status === 'done')
      
      let newProjectStatus = 'planning'
      if (allDone) {
        newProjectStatus = 'completed'
      } else if (someInProgress) {
        newProjectStatus = 'in-progress'
      }
      
      await Project.findByIdAndUpdate(updated.project, { status: newProjectStatus })
    }
    
    res.json(updated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)

    if (!task) return res.status(404).json({ message: 'Task not found' })

    // Only creators can delete tasks
    if (task.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not allowed to delete tasks created by others' })
    }

    await task.deleteOne()
    res.json({ message: 'Task deleted' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router