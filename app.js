require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const dbConnect = require('./config/dbConnect');
var cookieParser = require('cookie-parser')
const authRoute = require('./route/auth')
const userRoute = require('./route/user')
const bookingRoute = require('./route/book')
const session = require('express-session');
const passport = require('passport');
const {notFound,errorHandler} = require('./middleware/errorHandler')
const app = express();
const port =  9000;
dbConnect();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan('tiny'));
app.use(cookieParser())

app.use(session({ secret: 'your-secret-key', resave: true, saveUninitialized: true }));


app.use(passport.initialize());
app.use(passport.session());


app.use('/api/v1/auth',authRoute)
app.use('/api/v1/user',userRoute)
app.use('/api/v1/booking',bookingRoute)
//Route Calling

//MidleWare Calling
app.use(notFound)
app.use(errorHandler)


///////////////////////////////////////////////////////////////
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
