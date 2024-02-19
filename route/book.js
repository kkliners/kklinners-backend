const express = require('express')
const route = express.Router()
const {authMiddleware,isAdmin} =require('../middleware/authMiddleware')
const {createCleaningService,getSingleService,paystackPayment,cancelService,userCancelledServices,getAllCompletedServices,getAllUpcomingServices,getAllPendingServices,getUserCompletedServices,getUserUpcomingServices,getUserPendingServices}=require('../controller/bookingCtrl')

// Create a new cleaning service
route.post('/create-service',authMiddleware, createCleaningService);
// Process payment via Paystack
route.post('/paystack',authMiddleware, paystackPayment);
// Get details of a specific service for a user
route.get('/:userId/services/:serviceId',authMiddleware, getSingleService);
// Cancel a specific service
route.post('/:serviceId',authMiddleware, cancelService);
// Get all services canceled by a specific user
route.get('/:userId/cancelled-services',authMiddleware, userCancelledServices);
// Get all pending services 
route.get('/services/pending',authMiddleware, getAllPendingServices);
// Get all upcoming services 
route.get('/services/upcoming',authMiddleware, getAllUpcomingServices);
// Endpoint to get all pending services for a specific user
route.get('/user/:userId/services/pending',authMiddleware, getUserPendingServices);
// Endpoint to get all upcoming services for a specific user
route.get('/user/:userId/services/upcoming',authMiddleware, getUserUpcomingServices);
// Endpoint to get all completed services for a specific user
route.get('/user/:userId/services/completed',authMiddleware, getUserCompletedServices);

module.exports = route;