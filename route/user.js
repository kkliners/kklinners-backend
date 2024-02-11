const express = require('express')
const route = express.Router()
const {authMiddleware,isAdmin} =require('../middleware/authMiddleware')
const {getAllUser,getUser, deleteUser, updateUser,blockUser,unBlockUser,createVerificationPin,verifyPin} = require('../controller/userCtrl')
//Register User;
//username,email,password,confirm-password;
const {getUserServices}= require('../controller/bookingCtrl')
route.get('/all-users',isAdmin,authMiddleware, getAllUser)
route.get('/:id',authMiddleware, getUser)
route.delete('/:id',authMiddleware,deleteUser)
route.put('/edit-user/:id',authMiddleware,updateUser)
route.put('/block-user/:id',isAdmin,authMiddleware,blockUser)
route.put('/unblock-user/:id',isAdmin,authMiddleware,unBlockUser)
route.post('/create-pin',isAdmin,authMiddleware,createVerificationPin)
route.get('/services/:user_id',authMiddleware,getUserServices)
route.post('/verify-pin',isAdmin,authMiddleware,verifyPin)
module.exports = route;