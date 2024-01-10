const BookedService = require('./bookedService'); // Import the "booked


// Create a new booked service
//PAYLOAD
// {
//     "user": "userObjectId", // Replace with the actual user ObjectId
//     "service": "serviceObjectId", // Replace with the actual service ObjectId
//     "bookingDate": "2023-09-28T12:00:00Z",
//     "duration": 120, // Duration in minutes or hours
//     "location": "123 Main Street, City",
//     "price": 50.0,
//     "paymentStatus": "paid" // Payment status (e.g., 'paid', 'pending', 'failed')
//   }
app.post('/booked-services', async (req, res) => {
    try {
      const { user, service, bookingDate, duration, location, price, paymentStatus } = req.body;
  
      // Create a new booked service document
      const newBookedService = new BookedService({
        user,
        service,
        bookingDate,
        duration,
        location,
        price,
        paymentStatus,
      });
  
      // Save the booked service to the database
      const savedBookedService = await newBookedService.save();
  
      res.status(201).json(savedBookedService);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });



  app.get('/user-booked-services/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
  
      // Find all booked services where the user field matches the userId
      const userBookedServices = await BookedService.find({ user: userId });
  
      res.status(200).json(userBookedServices);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
   