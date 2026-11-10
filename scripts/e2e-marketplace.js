#!/usr/bin/env node
// End-to-end test of the Kliner marketplace, run against the live API.
//
//   vendor applies → admin can't verify until checks are done → admin verifies
//   → customer books in Gbagada (server prices it, rejects other areas)
//   → payment (simulated: Paystack test checkout needs a browser)
//   → admin assigns → vendor accepts / starts / completes → admin records payout
//
// Requires the backend running (node app.js). Usage:
//   node scripts/e2e-marketplace.js [--base http://localhost:3002]

require("dotenv").config();
const mongoose = require("mongoose");
const Partner = require("../model/partner");
const Service = require("../model/house");
const User = require("../model/user");
const { seedTestAccounts } = require("./seed-test-accounts");
const { calculatePrice } = require("../utils/pricing");
const { COMMISSION_RATE } = require("../config/marketplace");

const baseIdx = process.argv.indexOf("--base");
const BASE = baseIdx > -1 ? process.argv[baseIdx + 1] : `http://localhost:${process.env.PORT?.trim() || 3002}`;
const E2E_TAG = "[E2E test booking]";

let passed = 0;
let failed = 0;
const check = (name, condition, detail = "") => {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ""}`);
  }
};
const section = (title) => console.log(`\n${title}`);

const api = async (method, path, token, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, body: json };
};

const login = async (email, password) => {
  const r = await api("POST", "/api/v1/auth/login", null, { email, password });
  if (!r.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.body.data.token;
};

const main = async () => {
  console.log(`Kliner marketplace E2E  →  ${BASE}`);

  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`\nBackend is not reachable at ${BASE}. Start it with: node app.js`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL);

  /* ---------- setup ---------- */
  section("Setup");
  const accounts = await seedTestAccounts();
  const acc = Object.fromEntries(accounts.map((a) => [a.key, a]));
  check("test accounts seeded (admin, vendor, customer)", accounts.length === 3);

  // Clean previous E2E runs so the test is repeatable
  await Partner.deleteOne({ user_id: acc.vendor.user_id });
  const removed = await Service.deleteMany({ user_id: acc.customer.user_id, "customerInfo.notes": E2E_TAG });
  check(`previous E2E data cleared (${removed.deletedCount} old bookings)`, true);

  const token = {
    admin: await login(acc.admin.email, acc.admin.password),
    vendor: await login(acc.vendor.email, acc.vendor.password),
    customer: await login(acc.customer.email, acc.customer.password),
  };
  check("all three accounts can log in", Object.values(token).every(Boolean));

  /* ---------- vendor applies ---------- */
  section("1. Vendor signs up and applies");
  let r = await api("GET", "/api/v1/partners/me", token.vendor);
  check("vendor starts with no partner profile", r.ok && r.body.data === null);

  r = await api("POST", "/api/v1/partners/apply", token.vendor, {
    companyName: "Sparkle Hands Cleaning",
    contactName: "Emma Waro",
    phone: "08030000002",
    officeAddress: "5 Olorunlogbon Street, Gbagada Phase 1",
    services: ["house_cleaning"],
    areas: ["Gbagada Phase 1"],
  });
  check("application without owner ID/guarantor is rejected", r.status === 400, r.body.message);

  const application = {
    companyName: "Sparkle Hands Cleaning",
    contactName: "Emma Waro",
    phone: "08030000002",
    email: acc.vendor.email,
    officeAddress: "5 Olorunlogbon Street, Gbagada Phase 1",
    isRegisteredBusiness: false,
    owner: { fullName: "Emmanuel Waro", idType: "nin" },
    guarantor: { fullName: "Grace Okafor", phone: "08031112222", relationship: "Pastor", address: "Medina Estate" },
    references: [
      { name: "Mrs Bello", phone: "08035556666" },
      { name: "Mr Adeyemi", phone: "08037778888" },
    ],
    teamSize: 6,
    yearsInBusiness: 4,
    about: "Residential deep cleaning and post-construction cleans across Gbagada.",
    services: ["house_cleaning", "laundry"],
    areas: ["Gbagada Phase 1", "Gbagada Phase 2", "Ifako-Gbagada", "Soluyi"],
    bank: { bankName: "GTBank", accountNumber: "0123456789", accountName: "Emmanuel Waro" },
  };
  r = await api("POST", "/api/v1/partners/apply", token.vendor, application);
  check("complete application (no CAC) is accepted as pending", r.status === 201 && r.body.data.status === "pending", JSON.stringify(r.body));
  const partnerId = r.body.data?._id;

  r = await api("GET", "/api/v1/partners/me/jobs", token.vendor);
  check("unverified vendor cannot see jobs", r.status === 403);

  r = await api("GET", "/api/v1/partners", token.vendor);
  check("vendor cannot open admin endpoints", !r.ok);

  /* ---------- admin verifies ---------- */
  section("2. Admin reviews and verifies the vendor");
  r = await api("GET", "/api/v1/partners?status=pending", token.admin);
  check("admin sees the pending application", r.ok && r.body.data.some((p) => p._id === partnerId));

  r = await api("PATCH", `/api/v1/partners/${partnerId}/status`, token.admin, { status: "verified" });
  check("verifying before checks are done is blocked", r.status === 400, r.body.message);

  r = await api("PATCH", `/api/v1/partners/${partnerId}/checks`, token.admin, {
    idSeen: true,
    bankNameMatches: true,
    guarantorCalled: true,
    referencesCalled: true,
    officeVisited: true,
    notes: "E2E: NIN slip matched owner. Guarantor (Pastor Okafor) confirmed 4 years. Office at Olorunlogbon St visited.",
  });
  check("admin ticks verification checks", r.ok && r.body.data.verificationChecks.officeVisited === true);

  r = await api("GET", "/api/v1/partners/me", token.vendor);
  check("vendor cannot see admin's private notes", r.ok && r.body.data.verificationChecks?.notes === undefined);

  r = await api("PATCH", `/api/v1/partners/${partnerId}/status`, token.admin, { status: "verified" });
  check("admin verifies the vendor", r.ok && r.body.data.status === "verified");
  const vendorUser = await User.findOne({ user_id: acc.vendor.user_id }).lean();
  check("vendor account role becomes provider", vendorUser.role === "provider");

  /* ---------- customer books ---------- */
  section("3. Customer books a cleaning in Gbagada");
  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const serviceData = {
    category: "Deep Cleaning",
    package: "Standard Package",
    items: { "Living Room": 1, Bedrooms: 2, Bathrooms: 1, Kitchen: 1 },
    homeSize: "medium",
    frequency: "one-time",
    estimatedPrice: 1, // tampered — the server must ignore this
  };
  const booking = (area) => ({
    user_id: acc.customer.user_id,
    serviceType: "house_cleaning",
    serviceData,
    bookingDetails: {
      bookingDate: tomorrow,
      bookingTime: "10:00 AM",
      area,
      location: `12 Diya Street, ${area || "Lekki"}, Lagos`,
    },
    customerInfo: { name: "Onyinye Achomadu", phone: "08030000003", email: acc.customer.email, notes: E2E_TAG },
  });

  r = await api("POST", "/api/v1/services/create", token.customer, booking("Lekki Phase 1"));
  check("booking outside Gbagada is rejected", r.status === 400, r.body.message);

  r = await api("POST", "/api/v1/services/create", token.customer, booking("Ifako-Gbagada"));
  const expected = calculatePrice("house_cleaning", serviceData).total;
  check("booking in Ifako-Gbagada is created", r.status === 201, JSON.stringify(r.body).slice(0, 300));
  const jobId = r.body.data?.service?._id;
  const reference = r.body.data?.payment?.reference;
  check(`server priced it at ₦${expected.toLocaleString()} (ignored tampered ₦1)`, r.body.data?.payment?.amount_naira === expected, `got ${r.body.data?.payment?.amount_naira}`);
  check("Paystack (test mode) returned a checkout link", /^https:\/\/checkout\.paystack\.com\//.test(r.body.data?.payment?.authorization_url || ""));

  r = await api("POST", "/api/v1/services/verify-payment", token.customer, { reference });
  check("unpaid booking does not verify", !r.ok);

  // Paystack test checkout needs a browser, so mark the payment the same way
  // verifyPayment does after a successful Paystack response.
  await Service.updateOne(
    { _id: jobId },
    {
      $set: {
        "booking.paymentStatus": "paid",
        "booking.progress": "confirmed",
        "booking.payment.verified_at": new Date(),
        "booking.payment.paid_amount_kobo": expected * 100,
        "booking.payment.paid_amount_naira": expected,
      },
    }
  );
  check("payment simulated (test mode)", true);

  /* ---------- admin assigns ---------- */
  section("4. Admin assigns the job");
  r = await api("GET", "/api/v1/partners/admin/jobs?view=unassigned", token.admin);
  check("job appears in 'to assign' queue", r.ok && r.body.data.some((j) => String(j.id) === String(jobId)));

  r = await api("POST", `/api/v1/partners/admin/jobs/${jobId}/assign`, token.admin, { partnerId });
  check("admin assigns the job to Sparkle Hands", r.ok && r.body.data.status === "assigned", JSON.stringify(r.body));

  /* ---------- vendor does the job ---------- */
  section("5. Vendor accepts, starts and completes the job");
  r = await api("GET", "/api/v1/partners/me/jobs", token.vendor);
  let job = r.body.data?.jobs?.find((j) => String(j.id) === String(jobId));
  check("vendor sees the new job", Boolean(job));
  check("customer phone/address hidden before accepting", job && !job.customer.phone && job.location === "Ifako-Gbagada");
  const expectedPayout = expected - Math.round(expected * COMMISSION_RATE);
  check(`vendor sees they'll earn ₦${expectedPayout.toLocaleString()}`, job?.estimatedPayout === expectedPayout, `got ${job?.estimatedPayout}`);

  r = await api("POST", `/api/v1/partners/jobs/${jobId}/start`, token.vendor);
  check("cannot start before accepting", r.status === 400);

  r = await api("POST", `/api/v1/partners/jobs/${jobId}/accept`, token.vendor);
  check("vendor accepts", r.ok && r.body.data.status === "accepted");
  check("customer phone/address revealed after accepting", r.body.data.customer.phone === "08030000003" && r.body.data.location.includes("Diya Street"));

  r = await api("GET", "/api/v1/services/my-services", token.customer);
  const mine = r.body.data?.services?.find((s) => String(s.id) === String(jobId));
  check("customer sees their partner and phone", mine?.partnerName === "Sparkle Hands Cleaning" && mine?.partnerPhone === "08030000002");

  r = await api("POST", `/api/v1/partners/jobs/${jobId}/start`, token.vendor);
  check("vendor starts the job", r.ok && r.body.data.status === "in_progress");

  r = await api("POST", `/api/v1/partners/jobs/${jobId}/complete`, token.vendor, { notes: "All rooms done. Customer happy." });
  check("vendor completes the job", r.ok && r.body.data.status === "completed");
  check(
    `payout recorded: ₦${expectedPayout.toLocaleString()} to vendor, ${COMMISSION_RATE * 100}% to Kliner`,
    r.body.data.payout?.status === "pending" && r.body.data.payout?.partnerAmount === expectedPayout,
    JSON.stringify(r.body.data.payout)
  );

  /* ---------- payout ---------- */
  section("6. Admin pays the vendor");
  r = await api("GET", "/api/v1/partners/admin/jobs?view=payouts", token.admin);
  check("job is in 'payouts due'", r.ok && r.body.data.some((j) => String(j.id) === String(jobId)));

  r = await api("POST", `/api/v1/partners/admin/jobs/${jobId}/payout`, token.admin, { transferReference: "E2E-TRF-0001" });
  check("admin records the bank transfer", r.ok && r.body.data.payout.status === "paid");

  r = await api("GET", "/api/v1/partners/me/jobs", token.vendor);
  check(`vendor dashboard shows ₦${expectedPayout.toLocaleString()} paid`, r.body.data?.earnings?.paid >= expectedPayout);

  r = await api("GET", "/api/v1/partners/admin/overview", token.admin);
  check("admin overview reports GMV, commission and areas", r.ok && r.body.data.money.gmv >= expected && r.body.data.byArea.some((a) => a.area === "Ifako-Gbagada"));

  /* ---------- extra: a second job left for you to try in the UI ---------- */
  section("7. Leave a fresh paid job for manual testing");
  r = await api("POST", "/api/v1/services/create", token.customer, {
    ...booking("Gbagada Phase 1"),
    serviceData: { ...serviceData, category: "Standard Cleaning", items: { Bedrooms: 3, Kitchen: 1 } },
  });
  if (r.ok) {
    await Service.updateOne(
      { _id: r.body.data.service._id },
      { $set: { "booking.paymentStatus": "paid", "booking.progress": "confirmed", "booking.payment.verified_at": new Date() } }
    );
  }
  check("second paid booking waiting in the admin 'to assign' queue", r.ok);

  console.log(`\n${failed ? "FAILED" : "PASSED"} — ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
};

main()
  .catch((err) => {
    console.error("\nE2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
