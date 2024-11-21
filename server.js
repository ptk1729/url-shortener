const express = require("express")
const axios = require('axios')
const cheerio = require('cheerio')
// const slugify = require('slugify')
const fs = require('fs');
const path = require('path');

require("dotenv").config()
const cors = require('cors')
// Import required packages
// require('dotenv').config()
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const sequelize = require("./sequelize")
const { DataTypes } = require("sequelize")
const shortid = require("shortid") // Add this line to use shortid for generating short URLs
const slugify = require("slugify")
const Url = require('./models/Url')
// const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const User = require('./models/User') // Ensure the correct path

const app = express()

// const PORT_DEV = 80
// const PORT_PROD = 443
const APP_PORT = process.env.PORT

const otpStore = {}
const templatePath = path.join(__dirname, 'templates', 'otpEmailTemplate.html');

// Email transport for sending OTPs using environment variables
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SUPPORT_ACCOUNT_EMAIL, // Email address from .env file
        pass: process.env.SUPPORT_ACCOUNT_PASSWORD // Email password from .env file
    }
})
// const APP_PORT = process.env.PORT || PORT_PROD || PORT_DEV || 3000;
const origins = process.env.CORS_ALLOWLIST.split(",")
// console.log(origins)
// CORS opt
const corsOptions = {
    // origin: ['http://localhost:3000', 'http://localhost', 'https://gehe.fyi'], // Allow requests from this origin
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization', "Bearer"], // Allowed headers
    credentials: true // Allow cookies and authentication headers
}
// const corsOptions = {
//     origin: 'http://localhost:3000',
//     credentials: true,
// }
app.use(cors(corsOptions))
app.use(express.json())

app.get('/test-cors', (req, res) => {
    res.json({ message: 'CORS test successful' })
})

const authenticateToken = require('./authMiddleware')
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


async function generateMeaningfulSlug(originalUrl) {
    try {
        // Fetch the HTML content of the URL
        const response = await axios.get(originalUrl)
        const html = response.data

        // Parse the HTML and extract the title
        const $ = cheerio.load(html)
        let pageTitle = $('title').text().trim()

        if (pageTitle) {
            // Slugify the page title
            let baseSlug = slugify(pageTitle, {
                lower: true,
                strict: true,
            })

            // Optionally, take the first 10 characters
            return baseSlug.substring(0, 10)
        } else {
            // Fallback to using the hostname
            const parsed = new URL(originalUrl)
            let baseSlug = slugify(parsed.hostname.replace("www.", ""), {
                lower: true,
                strict: true,
            })
            return baseSlug
        }
    } catch (error) {
        console.error(`Error fetching the URL: ${error.message}`)

        // Fallback to using the hostname in case of an error
        const parsed = new URL(originalUrl)
        let baseSlug = slugify(parsed.hostname.replace("www.", ""), {
            lower: true,
            strict: true,
        })
        return baseSlug
    }
}
function getOtpEmailContent(otp) {
    const template = fs.readFileSync(templatePath, {
        encoding: 'utf-8'
    });
    return template.replace('{{OTP}}', otp); // Replace {{OTP}} with actual OTP
}

function oldGenerateMeaningfulSlug(originalUrl) {
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
    let baseSlug = ""
    try {
        baseSlug = await generateMeaningfulSlug(originalUrl)
    } catch (error) {
        baseSlug = oldGenerateMeaningfulSlug(originalUrl)
    }
    

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
            shortUrl = await oldGenerateMeaningfulSlug(originalUrl)
        }

        const newUrl = await Url.create({
            originalUrl,
            shortUrl,
            userId: req.user.id, // Associate URL with the user
        })
        res.status(201).json({
            originalUrl: newUrl.originalUrl,
            shortUrl: newUrl.shortUrl,
            id: newUrl.id,

        })
    } catch (error) {
        console.error('Error creating short URL:', error)
        res.status(500).json({ error: 'Failed to create short URL' })
    }
})



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
})

// Endpoint to fetch all archived URLs for the authenticated user
app.get('/shortener/archived', authenticateToken, async (req, res) => {
    try {
        const archivedUrls = await Url.findAll({
            where: { archived: true, userId: req.user.id },
        });
        res.json(archivedUrls);
    } catch (error) {
        console.error('Error fetching archived URLs:', error);
        res.status(500).json({ error: 'Failed to fetch archived URLs' });
    }
});

// Endpoint to delete all archived URLs for the authenticated user
app.delete('/shortener/archived', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Delete all archived URLs associated with the user
        const deletedCount = await Url.destroy({
            where: { archived: true, userId: userId }
        });

        if (deletedCount === 0) {
            return res.status(404).json({ message: 'No archived URLs found to delete' });
        }

        res.status(200).json({ message: `Successfully deleted ${deletedCount} archived URL(s)` });
    } catch (error) {
        console.error('Error deleting archived URLs:', error);
        res.status(500).json({ error: 'Failed to delete archived URLs' });
    }
});

app.delete('/shortener/all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Delete all URLs associated with the user
        const deletedCount = await Url.destroy({
            where: { userId: userId }
        });

        if (deletedCount === 0) {
            return res.status(404).json({ message: 'No URLs found to delete' });
        }

        res.status(200).json({ message: `Successfully deleted ${deletedCount} URL(s)` });
    } catch (error) {
        console.error('Error deleting all URLs:', error);
        res.status(500).json({ error: 'Failed to delete all URLs' });
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
})

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
})

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
})

// Endpoint to get a URL by ID
app.get('/shortener/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params

        const url = await Url.findOne({
            where: { id, userId: req.user.id },
        })
        const urlOutOfAllUrls = await Url.findOne({
            where: { id: id },
        })

        
        if (urlOutOfAllUrls && !url) {
            return res.status(401).json({ error: 'Unauthorized' })
        }
        if (!url && !urlOutOfAllUrls) {
            return res.status(404).json({ error: 'Url does not exist'})
        }

        res.status(200).json(url)   
    } catch (error) {
        console.error('Error fetching URL:', error)
        res.status(500).json({ error: 'Failed to fetch URL' })
    }
})


app.post('/auth/register', async (req, res) => {
    try {
        const userCount = await User.count()
        if (userCount >= 50) {
            return res.status(403).json({ error: 'User registration limit reached.' })
        }

        const { email } = req.body

        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } })
        if (existingUser) {
            return res.status(400).json({ error: 'Email already in use' })
        }

        // Generate OTP
        const otp = crypto.randomInt(100000, 999999).toString()

        // Store the OTP temporarily (expires in 10 minutes)
        otpStore[email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 }

        // Send OTP to the user's email
        const mailOptions = {
            from: process.env.SUPPORT_ACCOUNT_EMAIL, // Sender email from .env file
            to: email,
            subject: 'Your OTP Code',
            html: getOtpEmailContent(otp),
            // text: `Your OTP code is: ${otp}. It will expire in 10 minutes.`
        }
        await transporter.sendMail(mailOptions)

        return res.status(200).json({ message: 'OTP sent to your email. Please verify to complete registration.' })
    } catch (error) {
        console.error('Error sending OTP:', error)
        return res.status(500).json({ error: 'Failed to send OTP' })
    }
})


app.post('/auth/verify-otp', async (req, res) => {
    try {
        const { firstName, lastName, email, password, otp } = req.body

        // Check if OTP is valid and not expired
        if (!otpStore[email] || otpStore[email].otp !== otp) {
            return res.status(400).json({ error: 'Invalid or expired OTP.' })
        }

        if (Date.now() > otpStore[email].expiresAt) {
            delete otpStore[email] // Remove expired OTP
            return res.status(400).json({ error: 'OTP has expired. Please register again.' })
        }

        // Create new user
        const user = await User.create({ firstName, lastName, email, password })

        // Generate JWT token
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '8h',
        })

        // Clean up OTP store (remove it after successful registration)
        delete otpStore[email]

        return res.status(201).json({ token })
    } catch (error) {
        console.error('Error verifying OTP:', error)
        return res.status(500).json({ error: 'Failed to verify OTP' })
    }
});

app.get('/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] } // Exclude the password field
        })
        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }
        res.json(user)
    } catch (error) {
        console.error('Error fetching user details:', error)
        res.status(500).json({ error: 'Failed to fetch user details' })
    }
});
// Endpoint to update user details
app.put('/auth/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id
        const { firstName, lastName, email, password } = req.body

        // Find the user by ID
        const user = await User.findByPk(userId)
        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Update user fields if provided
        if (firstName) user.firstName = firstName
        if (lastName) user.lastName = lastName

        if (email) {
            // Check if the new email is already taken by another user
            const existingUser = await User.findOne({ where: { email } })
            if (existingUser && existingUser.id !== userId) {
                return res.status(400).json({ error: 'Email already in use' })
            }
            user.email = email
        }
        if (password) user.password = password;
        // if (password) {
        //     // Hash the new password before saving
        //     const saltRounds = 10
        //     const hashedPassword = await bcrypt.hash(password, saltRounds)
        //     user.password = hashedPassword
        // }

        // Save the updated user
        await user.save()

        // Exclude the password from the response
        const { password: pwd, ...userData } = user.toJSON()

        res.status(200).json({ message: 'User updated successfully', user: userData })
    } catch (error) {
        console.error('Error updating user details:', error)
        res.status(500).json({ error: 'Failed to update user details' })
    }
});

app.delete('/auth/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id
        const allUrls = await Url.findAll({ where: { userId: userId } })
        // console.log(allUrls);
        if (allUrls.length >= 0) {
            return res.status(409).json({ error: 'Cannot delete account with existing URLs' })
        }
        // Find the user
        const user = await User.findByPk(userId)
        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Delete the user
        await user.destroy()

        res.status(200).json({ message: 'Account deleted successfully' })
    } catch (error) {
        // console.error('Error deleting account:', error);
        res.status(500).json({ error: 'Failed to delete account' })
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

        // res.json({ token })
        res.status(200).json({ token })
    } catch (error) {
        console.error('Error logging in user:', error)
        res.status(500).json({ error: 'Failed to log in user' })
    }
})

app.get('/', (req, res) => {
    // res.send(redirect)
    // reditect to google.com
    res.redirect('https://gehe.vercel.app/')
    // res.send('Welcome to the URL Shortener API!')
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
})


// Endpoint to get all URLs (for demonstration purposes)

initializeApp()
