const express = require('express')
const route = express.Router()
const {authMiddleware,isAdmin} =require('../middleware/authMiddleware')
const {getAllUser,getUser, deleteUser, updateUser,blockUser,unBlockUser,changePassword,forgotPasswordToken, } = require('../controller/userCtrl')
//Register User;
//username,email,password,confirm-password;

route.get('/all-users',isAdmin,authMiddleware, getAllUser)
route.get('/:id',authMiddleware, getUser)
route.delete('/:id',authMiddleware,deleteUser)
route.put('/edit-user',authMiddleware,updateUser)
route.put('/edit-user/:id',authMiddleware,updateUser)
route.put('/block-user/:id',isAdmin,authMiddleware,blockUser)
route.put('/unblock-user/:id',isAdmin,authMiddleware,unBlockUser)
route.put('/reset-password', authMiddleware, changePassword);
// app.use('/logout', authMiddleware, logoutUser);
route.post('/forgot-password-token', forgotPasswordToken);
// Define the reset password route with a token parameter
// route.put('/reset-password/token', );

module.exports = route;