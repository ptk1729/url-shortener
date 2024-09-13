// models/Url.js
const { DataTypes } = require('sequelize')
const sequelize = require('../sequelize')
const User = require('./user')

const Url = sequelize.define(
    'Url',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        originalUrl: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                isUrl: true,
            },
        },
        shortUrl: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        clicks: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        archived: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
    },
    {
        timestamps: true,
        tableName: 'urls',
    }
)
Url.belongsTo(User, { foreignKey: 'userId' })
User.hasMany(Url, { foreignKey: 'userId' });

module.exports = Url
