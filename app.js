require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const dbConnect = require('./config/dbConnect');
const authRoute = require('./route/auth')
const userRoute = require('./route/user')
const serviceRoute = require('./route/book');

const cors = require('cors')
const {notFound,errorHandler} = require('./middleware/errorHandler')
const app = express();
const port =  process.env.PORT  || 9000  ;
dbConnect();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan('tiny'));
app.use(cors())
// Apply formidable middleware to all routes



app.use('/api/v1/auth',authRoute)
app.use('/api/v1/user',userRoute)
app.use('/api/v1/service',serviceRoute)



//Route Calling

//MidleWare Calling
app.use(notFound)
// app.use(errorHandler)


///////////////////////////////////////////////////////////////
// Start the server
app.listen(port, "0.0.0.0",() => {
  console.log(`Server is running on port ${port}`);
});
