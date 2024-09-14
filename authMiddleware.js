// authMiddleware.js
const jwt = require('jsonwebtoken')
const User = require('./models/User')

async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1] // Format: Bearer TOKEN

        if (!token) {
            return res.status(401).json({ error: 'Access token required' })
        }

        // Verify the token
        const payload = jwt.verify(token, process.env.JWT_SECRET)

        // Find the user associated with the token
        const user = await User.findByPk(payload.id)
        if (!user) {
            return res.status(401).json({ error: 'User not found' })
        }

        // Attach user to the request object
        req.user = user
        next()
    } catch (error) {
        // Handle specific JWT errors
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' })
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' })
        } else {
            console.error('Error authenticating token:', error)
            return res.status(500).json({ error: 'Internal server error' })
        }
    }
}

module.exports = authenticateToken
