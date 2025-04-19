const express = require ('express')
require('../config/passport-settup')
const route = express.Router()

const {registerUser,loginUser,passPinVerification,verifyEmail,forgotPasswordToken,changePassword,userImageUpdate } = require('../controller/userCtrl')

route.post('/register', registerUser)
route.post('/verifyotp', verifyEmail)
route.post('/login', loginUser)

route.post('/upload',userImageUpdate )
route.post('/send-password-change-email', forgotPasswordToken);
route.post('/verifypin', passPinVerification)//password pin verification
route.put('/reset-password', changePassword);//password change
module.exports = route;