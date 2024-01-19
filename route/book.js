const express = require('express')
const route = express.Router()
const {createCleaningService,getSingleService,paystackPayment}=require('../controller/bookingCtrl')


route.post('/create-service',createCleaningService)


route.get('/:userId/services/:serviceId',getSingleService)
route.get('/paystack', paystackPayment)
module.exports = route;