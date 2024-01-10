const express = require ('express')
require('../config/passport-settup')
const route = express.Router()
const {registerUser,loginUser,filldata} = require('../controller/userCtrl')

route.post('/register', registerUser)
route.post('/login', loginUser)
route.post('/signup', filldata)

module.exports = route;