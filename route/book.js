const express = require('express')
const route = express.Router()
const {createCleaningService}=require('../controller/bookingCtrl')


route.post('/create-service',createCleaningService)


module.exports = route;