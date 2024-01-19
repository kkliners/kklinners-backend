require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const dbConnect = require('./config/dbConnect');
const authRoute = require('./route/auth')
const userRoute = require('./route/user')
const serviceRoute = require('./route/book');
const {notFound,errorHandler} = require('./middleware/errorHandler')
const app = express();
const port =  9000;
dbConnect();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan('tiny'));




app.use('/api/v1/auth',authRoute)
app.use('/api/v1/user',userRoute)
app.use('/api/v1/service',serviceRoute)
//Route Calling

//MidleWare Calling
app.use(notFound)
app.use(errorHandler)


///////////////////////////////////////////////////////////////
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
