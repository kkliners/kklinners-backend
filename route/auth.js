const express = require ('express')
require('../config/passport-settup')
const route = express.Router()
const {registerUser,loginUser,filldata,veriffyPin} = require('../controller/userCtrl')

route.post('/register', registerUser)
route.post('/login', loginUser)
route.post('/signup', filldata)
route.post('/verifypin', veriffyPin)
module.exports = route;