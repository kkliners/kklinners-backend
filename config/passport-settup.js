// const passport = require('passport');
// const GoogleStrategy = require('passport-google-oauth20').Strategy;
// const User = require('../model/user');

// passport.serializeUser(async (user, done) => {
//   done(null, user.id); // user.id is often used as the identifier
// });

// passport.deserializeUser(async (id, done) => {
//   try {
//     const user = await User.findById(id);
//     done(null, user);
//   } catch (err) {
//     done(err, null);
//   }
// });

// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.Google_CLIENT_ID,
//       clientSecret: process.env.Google_CLIENT_SECRET,
//       callbackURL: process.env.Google_Callback_Url,
//       scope: ['profile', 'email'],
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       try {
//         let user = await User.findOne({ email: profile.emails[0].value });


//         if (!user) {
//           user = new User({
//             googleId: profile.id,
//             email: profile.emails[0].value,
//             accessToken: accessToken,
//             refreshToken: refreshToken,
//           });
//           await user.save();
//           console.log('new user')
//         } else {
//           user.accessToken = accessToken;
//           user.refreshToken = refreshToken;
//           await user.save();
//           console.log('user exist in ')
//         }

//         return done(null, user);
//       } catch (err) {
//         return done(err);
//       }
//     }
//   )
// );
