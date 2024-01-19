// const User = require('../model/user')
// // Middleware to check if the user has completed their profile
// const checkProfileCompletion = async (req, res, next) => {
//     try {
//       // Get the user ID from the authenticated user (assuming you have authentication middleware)
//       const id = req.user._id;
  
//       // Find the user in the database by ID
//       const user = await User.findById(id);
  
//       if (!user) {
//         return res.status(404).json({ error: 'User not found' });
//       }
  
//       // Check if essential profile fields are missing
//       if (!user.fullName || !user.dateOfBirth || !user.address) {
//         // Redirect the user to the complete signup page
//         return res.redirect('/complete-signup');
//       }
  
//       // User has completed their profile, proceed to the next middleware or route handler
//       next();
//     } catch (error) {
//       console.error(error);
//       res.status(500).json({ error: 'Internal Server Error' });
//     }
//   };
  