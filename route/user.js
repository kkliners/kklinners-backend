const express = require('express')
const route = express.Router()
const {authMiddleware,isAdmin} =require('../middleware/authMiddleware')
const {
  getAllUser,
  filldata,
  getUser,
  deleteUser,
  updateUser,
  blockUser,
  unBlockUser,
  createVerificationPin,
  verifyPin,
  
  userImageUpdate,
} = require("../controller/userCtrl");
//Register User;
//username,email,password,confirm-password;
const {getUserServices}= require('../controller/bookingCtrl')

route.get('/user-info',authMiddleware, getUser)
route.delete('/delete-user',authMiddleware,deleteUser)
route.put('/edit-user/:id',authMiddleware,updateUser)
route.put('/block-user/:id',isAdmin,authMiddleware,blockUser)
route.put('/unblock-user/:id',isAdmin,authMiddleware,unBlockUser)
route.post('/create-pin',isAdmin,authMiddleware,createVerificationPin)
route.get('/services/:user_id',authMiddleware,getUserServices)
route.post('/verify-pin',isAdmin,authMiddleware,verifyPin)
route.post('/fill-data',authMiddleware, filldata)
route.put("/update-profile-image", authMiddleware, userImageUpdate);

// Admin Routes
route.get("/all-users", isAdmin, authMiddleware, getAllUser);
module.exports = route;