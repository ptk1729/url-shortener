require('dotenv').config() // This line loads the environment variables from the .env file

module.exports = {
  development: {
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    host: process.env.PGHOST,
    dialect: 'postgres', // or whatever dialect you are using
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? { require: true } : false
    }
  },
  production: {
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    host: process.env.PGHOST,
    dialect: 'postgres', // or whatever dialect you are using
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? { require: true } : false
    }
  }
}
