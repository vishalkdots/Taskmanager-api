const express = require('express')
const router = express.Router()
const Financial = require('../models/Financial')
const { protect } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/roleMiddleware')

// Protect all financial routes
router.use(protect)

// GET /api/financials/salary-status - each employee + paid status for current month
// NOTE: specific routes MUST come before /:id to avoid route conflicts
router.get('/salary-status', authorizeRoles('admin', 'hr'), async (req, res) => {
  try {
    const User = require('../models/User')
    const employees = await User.find({}).select('name email role salary designation')

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const monthLogs = await Financial.find({
      category: 'salary',
      createdAt: { $gte: monthStart, $lte: monthEnd }
    }).populate('employee', '_id')

    const paidIds = new Set(monthLogs.map(l => l.employee?._id?.toString()).filter(Boolean))

    res.json(employees.map(emp => ({
      _id: emp._id,
      name: emp.name,
      email: emp.email,
      role: emp.role,
      designation: emp.designation,
      salary: emp.salary || 0,
      paid: paidIds.has(emp._id.toString())
    })))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/financials - Fetch all ledger logs
router.get('/', authorizeRoles('admin', 'hr', 'accountant'), async (req, res) => {
  try {
    const logs = await Financial.find()
      .sort({ createdAt: -1 })
      .populate('employee', 'name email role')
      .populate('createdBy', 'name email')
    res.json(logs)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/financials/pay-salary - quick-pay an employee monthly salary
router.post('/pay-salary', authorizeRoles('admin', 'hr'), async (req, res) => {
  try {
    const { employeeId } = req.body
    if (!employeeId) return res.status(400).json({ message: 'employeeId is required' })

    const User = require('../models/User')
    const emp = await User.findById(employeeId)
    if (!emp) return res.status(404).json({ message: 'Employee not found' })

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const alreadyPaid = await Financial.findOne({
      category: 'salary', employee: employeeId,
      createdAt: { $gte: monthStart, $lte: monthEnd }
    })
    if (alreadyPaid) {
      return res.status(409).json({ message: `${emp.name}'s salary for this month is already paid.` })
    }

    const monthName = now.toLocaleString('default', { month: 'long' })
    const log = await Financial.create({
      type: 'expense',
      category: 'salary',
      amount: emp.salary || 0,
      description: `${monthName} ${now.getFullYear()} salary — ${emp.name} (${emp.designation || emp.role})`,
      employee: employeeId,
      createdBy: req.user._id
    })

    const populated = await Financial.findById(log._id)
      .populate('employee', 'name email')
      .populate('createdBy', 'name')

    res.status(201).json(populated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/financials - Create a ledger log
router.post('/', authorizeRoles('admin', 'hr', 'accountant'), async (req, res) => {
  try {
    const { type, category, amount, description, employee } = req.body

    if (req.user.role === 'hr') {
      if (!['salary', 'office_expense', 'advance'].includes(category)) {
        return res.status(403).json({ message: 'HR staff can only log salaries, office expenses, and advances.' })
      }
    }

    if (req.user.role === 'accountant') {
      if (!['project_income', 'project_expense', 'investment', 'advance'].includes(category)) {
        return res.status(403).json({ message: 'Accountants can only log project incomes, expenses, investments, and advances.' })
      }
    }

    const log = await Financial.create({
      type, category, amount, description,
      employee: category === 'salary' ? employee : null,
      createdBy: req.user._id
    })

    const populated = await Financial.findById(log._id)
      .populate('employee', 'name email')
      .populate('createdBy', 'name')

    res.status(201).json(populated)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// DELETE /api/financials/:id - Delete a ledger log (admin only)
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const log = await Financial.findById(req.params.id)
    if (!log) return res.status(404).json({ message: 'Log not found' })
    await log.deleteOne()
    res.json({ message: 'Ledger entry deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
