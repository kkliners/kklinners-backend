#!/usr/bin/env node
// Creates (or promotes) a single admin account. Safe for production:
// the password comes from the environment, never from the code.
//
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' node scripts/create-admin.js
//
// If the email already has an account it is promoted to admin and its
// password is reset to the one given.

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../model/user");

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

(async () => {
  if (!email || password.length < 10) {
    console.error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 10 characters.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 10000 });

  let user = await User.findOne({ email });
  const existed = Boolean(user);
  if (!user) user = new User({ email });

  Object.assign(user, {
    password, // hashed by the model's pre-save hook
    role: "admin",
    isEmailVerified: true,
    isBlocked: false,
  });
  if (!existed) {
    Object.assign(user, {
      firstName: process.env.ADMIN_FIRST_NAME || "Kliner",
      lastName: process.env.ADMIN_LAST_NAME || "Admin",
      username: process.env.ADMIN_USERNAME || "kliner_admin",
      phone: process.env.ADMIN_PHONE || "08000000000",
      address: process.env.ADMIN_ADDRESS || "Kliner HQ, Gbagada, Lagos",
    });
  }
  user.otp = undefined;
  await user.save();
  console.log(`${existed ? "Updated" : "Created"} admin: ${email}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
