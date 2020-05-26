'use strict'

const winston = require('winston')
const config = require('./config/config.js')

const logLevel = config.runningInAws ? 'info' : 'debug'
const transports = []

transports.push(new winston.transports.Console({ level: logLevel, handleExceptions: true, timestamp: true }))

const logger = new winston.Logger({ transports: transports })

exports.logger = logger
