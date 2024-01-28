const express = require('express')
const route = express.Router()
const {createCleaningService,getSingleService,paystackPayment,cancelService,userCancelledServices,getAllCompletedServices,getAllUpcomingServices,getAllPendingServices,getUserCompletedServices,getUserUpcomingServices,getUserPendingServices}=require('../controller/bookingCtrl')

// Create a new cleaning service
route.post('/create-service', createCleaningService);
// Process payment via Paystack
route.post('/paystack', paystackPayment);
// Get details of a specific service for a user
route.get('/:userId/services/:serviceId', getSingleService);
// Cancel a specific service
route.post('/:serviceId', cancelService);
// Get all services canceled by a specific user
route.get('/:userId/cancelled-services', userCancelledServices);
// Get all pending services (comment for clarification)
route.get('/services/pending', getAllPendingServices);
// Get all upcoming services (comment for clarification)
route.get('/services/upcoming', getAllUpcomingServices);
// Endpoint to get all pending services for a specific user
route.get('/user/:userId/services/pending', getUserPendingServices);
// Endpoint to get all upcoming services for a specific user
route.get('/user/:userId/services/upcoming', getUserUpcomingServices);
// Endpoint to get all completed services for a specific user
route.get('/user/:userId/services/completed', getUserCompletedServices);

module.exports = route;