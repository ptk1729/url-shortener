const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.PGDATABASE,
  process.env.PGUSER,
  process.env.PGPASSWORD,
  {
    host: process.env.PGHOST,
    port: 5432,
    dialect: "postgres",
    dialectOptions: {
      ssl: {
        require: true
      },
      options: `project=${process.env.ENDPOINT_ID}`
    }
  }
);

module.exports = sequelize;
