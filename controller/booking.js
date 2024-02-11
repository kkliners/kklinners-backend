const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Import the User model
const User = require('../model/user'); // Adjust the path accordingly

// Function to generate a random 4-digit PIN
function generateRandomPIN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Connect to MongoDB


// Add PIN to all existing users
async function addPinToUsers() {
  try {
    // Find all existing users
    const users = await User.find({});

    // Iterate through each user and add a PIN
    for (const user of users) {
      // Check if user already has a PIN
      if (!user.pin) {
        // If no PIN exists, generate a random PIN and assign it to the user
        const pin = generateRandomPIN();
        user.pin = pin;

        // Save the user with the new PIN
        await user.save();

        console.log(`PIN added to user ${user.username}: ${pin}`);
      }
    }

    console.log('Script completed successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect from MongoDB
    mongoose.disconnect();
  }
}

// Run the script
addPinToUsers();
