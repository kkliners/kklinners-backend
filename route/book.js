const express = require('express')
const route = express.Router()
const {createCleaningService,getSingleService,paystackPayment,cancelService,userCancelledServices}=require('../controller/bookingCtrl')


route.post('/create-service',createCleaningService)
route.post('/paystack',paystackPayment)
route.get('/:userId/services/:serviceId',getSingleService)
route.post('/:serviceId',cancelService)
route.get('/:userId/cancelled-services',userCancelledServices)
module.exports = route;