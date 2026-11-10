#!/usr/bin/env node
// Creates (or resets) the three test accounts used for manual and E2E testing:
//   admin    → the Mail_Id address in .env
//   vendor   → emmawaro49@gmail.com
//   customer → achomaduonyinye@gmail.com
//
// Accounts are created directly in the database with email already verified,
// so no OTP emails are sent. Existing accounts with these emails get their
// password, role and profile RESET to the test values below.
//
// Usage:  node scripts/seed-test-accounts.js [--out path/to/credentials.md]

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const User = require("../model/user");

const ACCOUNTS = [
  {
    key: "admin",
    email: (process.env.Mail_Id || "").trim().toLowerCase(),
    password: "KlinerAdmin#2026",
    role: "admin",
    firstName: "Kliner",
    lastName: "Admin",
    username: "kliner_admin",
    phone: "08030000001",
    address: "Kliner HQ, Gbagada Phase 2, Lagos",
  },
  {
    key: "vendor",
    email: "emmawaro49@gmail.com",
    password: "KlinerVendor#2026",
    role: "user", // becomes "provider" once the admin verifies the partner
    firstName: "Emma",
    lastName: "Waro",
    username: "emma_waro",
    phone: "08030000002",
    address: "5 Olorunlogbon Street, Gbagada Phase 1, Lagos",
  },
  {
    key: "customer",
    email: "achomaduonyinye@gmail.com",
    password: "KlinerUser#2026",
    role: "user",
    firstName: "Onyinye",
    lastName: "Achomadu",
    username: "onyinye_a",
    phone: "08030000003",
    address: "12 Diya Street, Ifako-Gbagada, Lagos",
  },
];

const upsertAccount = async (acc) => {
  if (!acc.email) throw new Error(`No email for ${acc.key} (is Mail_Id set in .env?)`);

  // Free the username if another account holds it
  await User.updateOne(
    { username: acc.username, email: { $ne: acc.email } },
    { $unset: { username: 1 } }
  );

  let user = await User.findOne({ email: acc.email });
  const existed = Boolean(user);
  if (!user) user = new User({ email: acc.email });

  Object.assign(user, {
    password: acc.password, // hashed by the model's pre-save hook
    role: acc.role,
    firstName: acc.firstName,
    lastName: acc.lastName,
    username: acc.username,
    phone: acc.phone,
    address: acc.address,
    isEmailVerified: true,
    isBlocked: false,
  });
  user.otp = undefined;
  await user.save();
  return { ...acc, user_id: user.user_id, existed };
};

const writeCredentials = (outPath, rows) => {
  const line = (r) =>
    `| ${r.key} | \`${r.email}\` | \`${r.password}\` | ${r.role}${r.key === "vendor" ? " → provider after verification" : ""} |`;
  const md = `# Kliner test accounts

> Local testing only. This file is git-ignored — never commit it.
> Recreate/reset the accounts any time with:
> \`cd kklinners-backend && node scripts/seed-test-accounts.js --out ../Kliner-Web-App/TEST_ACCOUNTS.local.md\`

| Account | Email | Password | Role |
|---|---|---|---|
${rows.map(line).join("\n")}

## Where each account goes

| Account | Log in at | Then open |
|---|---|---|
| admin | http://localhost:3000/auth/signin | http://localhost:3000/admin |
| vendor | http://localhost:3000/partners → "I already have an account" | http://localhost:3000/partner |
| customer | http://localhost:3000/auth/signin | http://localhost:3000/ (book a service) |

## Paystack test payment (test mode)

On the Paystack checkout page use the test card:

- Card: \`4084 0840 8408 4081\`
- Expiry: any future date · CVV: \`408\`
- PIN: \`0000\` · OTP: \`123456\`

## Run the full end-to-end test

\`\`\`bash
cd kklinners-backend
node app.js                       # in one terminal
node scripts/e2e-marketplace.js   # in another
\`\`\`

The E2E test resets these accounts, then walks the whole flow: vendor applies → admin checks & verifies →
customer books in Gbagada → (payment simulated in test mode) → admin assigns → vendor accepts, starts,
completes → admin records payout. It leaves that data in place so you can see it in the dashboards.
`;
  fs.writeFileSync(outPath, md);
};

const seedTestAccounts = async ({ out } = {}) => {
  const rows = [];
  for (const acc of ACCOUNTS) rows.push(await upsertAccount(acc));
  if (out) writeCredentials(out, rows);
  return rows;
};

module.exports = { seedTestAccounts, ACCOUNTS };

if (require.main === module) {
  const outIdx = process.argv.indexOf("--out");
  const out = outIdx > -1 ? path.resolve(process.argv[outIdx + 1]) : null;
  mongoose
    .connect(process.env.MONGO_URL)
    .then(() => seedTestAccounts({ out }))
    .then((rows) => {
      for (const r of rows) {
        console.log(`${r.existed ? "reset  " : "created"}  ${r.key.padEnd(8)} ${r.email}`);
      }
      if (out) console.log(`\nCredentials written to ${out}`);
    })
    .catch((err) => {
      console.error("Seeding failed:", err.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
