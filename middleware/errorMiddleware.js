const errorHandler = (err, req, res, next) => {
  console.error('SERVER ERROR OCCURRED:', err)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode
  res.status(statusCode)
  res.json({
    message: err.message,
    stack: err.stack
  })
}

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`)
  res.status(404)
  next(error)
}

module.exports = { errorHandler, notFound }
