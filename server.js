const express = require("express")
require("dotenv").config()
const sequelize = require("./sequelize")
const { DataTypes } = require("sequelize")
const shortid = require("shortid") // Add this line to use shortid for generating short URLs
const slugify = require("slugify")
const Url = require('./models/Url');
// const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const User = require('./models/User') // Ensure the correct path

const app = express()
const PORT_DEV = 80
const PORT_PROD = 443
const APP_PORT = PORT_PROD
// const APP_PORT = process.env.PORT || PORT_PROD || PORT_DEV || 3000;
app.use(express.json())
const authenticateToken = require('./authMiddleware');
const MAX_URL_PER_USER = 100
// Initialize database and start server
async function initializeApp() {
    try {
        await sequelize.authenticate()
        console.log("Connection has been established successfully.")
        await sequelize.sync({ alter: true })
        console.log("Urls table created successfully!")

        app.listen(APP_PORT, () => {
            console.log(`Server is running on ${APP_PORT}`)
        })
    } catch (error) {
        console.error("Unable to connect to the database:", error)
    }
}
function generateMeaningfulSlug(originalUrl) {
    const parsed = new URL(originalUrl)
    let baseSlug = slugify(parsed.hostname.replace("www.", ""), {
        lower: true,
        strict: true
    })
    return baseSlug
}

async function findAvailableShortUrl(proposedShortUrl, originalUrl) {
    let shortUrl = proposedShortUrl
    let counter = 1
    const baseSlug = generateMeaningfulSlug(originalUrl)

    while (true) {
        const existingUrl = await Url.findOne({ where: { shortUrl } })
        if (!existingUrl) {
            return shortUrl
        }
        shortUrl = `${baseSlug}-${counter}`
        counter++
    }
}

// Endpoint to add a new URL
app.post('/shortener/new', authenticateToken, async (req, res) => {
    try {
        // Check if the user has reached the URL limit
        const urlCount = await Url.count({ where: { userId: req.user.id } })
        if (urlCount >= MAX_URL_PER_USER) {
            return res.status(403).json({ error: `URL limit reached. You cannot create more than ${MAX_URL_PER_USER} URLs.` })
        }

        const { originalUrl, proposedShortUrl } = req.body
        if (!originalUrl) {
            return res.status(400).json({ error: 'Original URL is required' })
        }

        let shortUrl
        if (proposedShortUrl) {
            shortUrl = await findAvailableShortUrl(proposedShortUrl, originalUrl)
        } else {
            shortUrl = await findAvailableShortUrl(
                generateMeaningfulSlug(originalUrl),
                originalUrl
            )
        }

        const newUrl = await Url.create({
            originalUrl,
            shortUrl,
            userId: req.user.id, // Associate URL with the user
        })
        res.status(201).json({
            originalUrl: newUrl.originalUrl,
            shortUrl: newUrl.shortUrl,
        })
    } catch (error) {
        console.error('Error creating short URL:', error)
        res.status(500).json({ error: 'Failed to create short URL' })
    }
});



// Update the /shortener/all endpoint
app.get('/shortener/all', authenticateToken, async (req, res) => {
    try {
        const urls = await Url.findAll({
            where: { archived: false, userId: req.user.id },
        })
        res.json(urls)
    } catch (error) {
        console.error('Error fetching URLs:', error)
        res.status(500).json({ error: 'Failed to fetch URLs' })
    }
});
// Endpoint to archive a URL by ID
app.patch('/shortener/:id/archive', async (req, res) => {
    try {
        const { id } = req.params

        const url = await Url.findByPk(id)
        if (!url) {
            return res.status(404).json({ error: 'URL not found' })
        }

        url.archived = true
        await url.save()

        res.status(200).json({ message: 'URL archived successfully', url })
    } catch (error) {
        console.error('Error archiving URL:', error)
        res.status(500).json({ error: 'Failed to archive URL' })
    }
});

// Endpoint to update a URL
app.put('/shortener/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params
        const { originalUrl, shortUrl } = req.body

        const url = await Url.findOne({
            where: { id, userId: req.user.id },
        })
        if (!url) {
            return res.status(404).json({ error: 'URL not found' })
        }

        // Update originalUrl if provided
        if (originalUrl) {
            url.originalUrl = originalUrl
        }

        // Check if the proposed shortUrl already exists
        if (shortUrl && shortUrl !== url.shortUrl) {
            const existingUrl = await Url.findOne({ where: { shortUrl } })
            if (existingUrl) {
                return res.status(400).json({ error: 'Short URL already exists' })
            }
            url.shortUrl = shortUrl
        }

        await url.save()

        res.json(url)
    } catch (error) {
        console.error('Error updating URL:', error)
        res.status(500).json({ error: 'Failed to update URL' })
    }
});

// Endpoint to delete a URL by ID
app.delete('/shortener/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params

        const url = await Url.findOne({
            where: { id, userId: req.user.id },
        })
        if (!url) {
            return res.status(404).json({ error: 'URL not found' })
        }

        await url.destroy()

        res.status(200).json({ message: 'URL deleted successfully' })
    } catch (error) {
        console.error('Error deleting URL:', error)
        res.status(500).json({ error: 'Failed to delete URL' })
    }
});

app.post('/auth/register', async (req, res) => {
    try {
        // Check if the total number of users has reached 50
        const userCount = await User.count()
        if (userCount >= 50) {
            return res.status(403).json({ error: 'User registration limit reached. No more users can be registered at this time.' })
        }

        const { firstName, lastName, email, password } = req.body

        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } })
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' })
        }

        // Create new user
        const user = await User.create({ firstName, lastName, email, password })

        // Generate JWT token
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '1h',
        })

        res.status(201).json({ token })
    } catch (error) {
        console.error('Error registering user:', error)
        res.status(500).json({ error: 'Failed to register user' })
    }
});

// Login an existing user
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body

        // Find user by email
        const user = await User.findOne({ where: { email } })
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' })
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password)
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' })
        }

        // Generate JWT token
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '1h',
        })

        res.json({ token })
    } catch (error) {
        console.error('Error logging in user:', error)
        res.status(500).json({ error: 'Failed to log in user' })
    }
});

app.get('/', (req, res) => {
    res.send('Welcome to the URL Shortener API!')
})
// Endpoint to fetch original URL and redirect
app.get('/:shortUrl', async (req, res) => {
    try {
        const { shortUrl } = req.params
        const url = await Url.findOne({
            where: {
                shortUrl,
                archived: false,
            },
        })

        if (url) {
            await url.increment('clicks')
            res.redirect(url.originalUrl)
        } else {
            res.status(404).json({ error: 'Short URL not found or has been archived' })
        }
    } catch (error) {
        console.error('Error fetching URL:', error)
        res.status(500).json({ error: 'Failed to fetch URL' })
    }
});


// Endpoint to get all URLs (for demonstration purposes)

initializeApp()
