const express = require('express')
const route = express.Router()
const {createCleaningService}=require('../controller/bookingCtrl')


route.post('/create-service',createCleaningService)
route.get('/services')

module.exports = route;