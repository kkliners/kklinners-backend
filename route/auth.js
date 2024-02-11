const express = require ('express')
require('../config/passport-settup')
const route = express.Router()
const {registerUser,loginUser,filldata,passPinVerification,verifyEmail,forgotPasswordToken,changePassword} = require('../controller/userCtrl')

route.post('/register', registerUser)
route.post('/verifyotp', verifyEmail)
route.post('/login', loginUser)
route.post('/signup', filldata)
route.post('/send-password-change-pin', forgotPasswordToken);
route.post('/verifypin', passPinVerification)//password pin verification
route.put('/reset-password', changePassword);//password change
module.exports = route;