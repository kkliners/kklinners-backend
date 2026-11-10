// Marketplace: partner companies, admin verification and job assignment.
const crypto = require("crypto");
const { uploadBuffers } = require("../utils/uploadFieldImages");
const Partner = require("../model/partner");
const Employee = require("../model/employee");
const Service = require("../model/house");
const { defaultMinutes } = require("../utils/duration");
const User = require("../model/user");
const {
  SERVICE_AREAS,
  COMMISSION_RATE,
  LAUNCH_DISTRICT,
  REQUIRED_VERIFICATION_CHECKS,
} = require("../config/marketplace");

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

const arrivalView = (s) => {
  const crew = s.serviceProvider?.assignedEmployees || [];
  const checkIns = s.arrivalLog?.checkIns || [];
  const checkedIds = new Set(checkIns.map((c) => c.employeeId));
  return {
    arrivedAt: s.arrivalLog?.arrivedAt || null,
    checkIns: checkIns.map((c) => ({
      employeeId: c.employeeId,
      name: c.name,
      checkedInAt: c.checkedInAt,
    })),
    crew: crew.map((e) => ({
      employeeId: e.employeeId,
      firstName: e.firstName,
      lastName: e.lastName,
      name: `${e.firstName || ""} ${e.lastName || ""}`.trim(),
      profilePhotoUrl: e.profilePhotoUrl || "",
      checkedIn: checkedIds.has(e.employeeId),
    })),
    allCheckedIn: crew.length > 0 && crew.every((e) => checkedIds.has(e.employeeId)),
  };
};

const jobView = (s) => ({
  id: s._id,
  service_id: s.service_id,
  serviceType: s.serviceType,
  serviceName: s.serviceName,
  serviceCategory: s.serviceCategory,
  serviceDetails: s.serviceDetails,
  amount: s.serviceRate,
  bookingDate: s.booking?.bookingDate,
  bookingTime: s.booking?.bookingTime,
  area: s.booking?.area,
  location: s.booking?.location,
  status: s.booking?.progress,
  expectedMinutes: s.booking?.expectedMinutes || defaultMinutes(s.serviceType),
  paymentStatus: s.booking?.paymentStatus,
  customer: {
    name: s.customerInfo?.name,
    phone: s.customerInfo?.phone,
    notes: s.customerInfo?.notes,
  },
  partner: s.serviceProvider?.providerId
    ? {
        id: s.serviceProvider.providerId,
        name: s.serviceProvider.providerName,
        assignedAt: s.serviceProvider.assignedAt,
        acceptedAt: s.serviceProvider.acceptedAt,
        startedAt: s.serviceProvider.startedAt,
      }
    : null,
  team: s.serviceProvider?.providerName
    ? { name: s.serviceProvider.providerName, phone: s.serviceProvider.providerPhone }
    : null,
  payout: s.payout,
  completedAt: s.completion?.completedAt,
  createdAt: s.createdAt,
  timeline: {
    booked: s.createdAt,
    paid: s.booking?.payment?.verified_at,
    assigned: s.serviceProvider?.assignedAt,
    accepted: s.serviceProvider?.acceptedAt,
    started: s.serviceProvider?.startedAt,
    completed: s.completion?.completedAt,
    paidOut: s.payout?.paidAt,
  },
  declinedBy: (s.serviceProvider?.declined || []).length,
  paymentReference: s.booking?.payment?.reference,
  fieldToken: s.serviceProvider?.fieldToken || null,
  fieldReports: (s.completion?.fieldReports || []).map((r) => ({
    message: r.message,
    photos: r.photos || [],
    reportKind: r.reportKind || "update",
    at: r.createdAt,
  })),
  completionRequest:
    s.booking?.progress === "completion_requested"
      ? { requestedAt: s.completion?.requestedAt, notes: s.completion?.requestNotes || "" }
      : null,
  arrival: arrivalView(s),
  customerSecurity: s.customerSecurity
    ? {
        visitorCode: s.customerSecurity.visitorCode,
        accessNotes: s.customerSecurity.accessNotes,
        belongingsAcknowledged: s.customerSecurity.belongingsAcknowledged,
        limitedAccessAcknowledged: s.customerSecurity.limitedAccessAcknowledged,
        issueCount: (s.customerSecurity.issueReports || []).length,
        issueReports: (s.customerSecurity.issueReports || []).map((r) => ({
          message: r.message,
          photos: r.photos || [],
          at: r.createdAt,
        })),
      }
    : null,
});

// Customer contact details are only shared once the partner has accepted
const partnerJobView = (s, commissionRate = COMMISSION_RATE) => {
  const job = jobView(s);
  // What the partner will earn — shown before they accept
  job.estimatedPayout =
    job.payout?.partnerAmount ?? Math.round((job.amount || 0) * (1 - commissionRate));
  delete job.paymentReference;
  if (!["accepted", "in_progress", "completed"].includes(job.status)) {
    job.customer = { name: job.customer.name };
    job.location = job.area; // exact address hidden until accepted
  }
  delete job.payout?.paidBy;
  return job;
};

/* ======================= PUBLIC ======================= */

// GET /api/v1/partners/areas
const getServiceAreas = (req, res) =>
  res.json({
    success: true,
    data: {
      district: LAUNCH_DISTRICT,
      areas: SERVICE_AREAS,
      commissionRate: COMMISSION_RATE,
      requiredChecks: REQUIRED_VERIFICATION_CHECKS,
    },
  });

/* ======================= PARTNER ======================= */

// POST /api/v1/partners/apply
const applyAsPartner = async (req, res) => {
  try {
    const existing = await Partner.findOne({ user_id: req.user.user_id });
    if (existing && existing.status !== "rejected") {
      return fail(res, 400, `You already have a ${existing.status} partner application.`);
    }

    const {
      companyName,
      contactName,
      phone,
      email,
      officeAddress,
      cacNumber,
      isRegisteredBusiness,
      owner,
      guarantor,
      references,
      teamSize,
      yearsInBusiness,
      about,
      services,
      areas,
      bank,
    } = req.body;

    if (!companyName || !contactName || !phone || !officeAddress) {
      return fail(res, 400, "Company name, contact name, phone and office address are required.");
    }
    if (!owner?.fullName || !owner?.idType) {
      return fail(res, 400, "Tell us the owner's full name and which ID they'll show us.");
    }
    if (!guarantor?.fullName || !guarantor?.phone) {
      return fail(res, 400, "A guarantor's name and phone number are required.");
    }
    if (isRegisteredBusiness && !cacNumber) {
      return fail(res, 400, "Enter your CAC number, or untick 'registered business'.");
    }
    if (!Array.isArray(services) || !services.length) {
      return fail(res, 400, "Select at least one service you offer.");
    }
    if (!Array.isArray(areas) || !areas.length || areas.some((a) => !SERVICE_AREAS.includes(a))) {
      return fail(res, 400, `Select at least one ${LAUNCH_DISTRICT} area you cover.`);
    }

    const data = {
      user_id: req.user.user_id,
      companyName,
      contactName,
      phone,
      email: email || req.user.email,
      officeAddress,
      isRegisteredBusiness: Boolean(isRegisteredBusiness),
      cacNumber: isRegisteredBusiness ? cacNumber : undefined,
      owner,
      guarantor,
      references: (references || []).filter((r) => r?.name && r?.phone).slice(0, 3),
      teamSize,
      yearsInBusiness,
      about,
      services,
      areas,
      bank,
      status: "pending",
      statusNote: undefined,
    };

    const partner = existing
      ? await Partner.findByIdAndUpdate(existing._id, data, { new: true, runValidators: true })
      : await Partner.create(data);

    return res.status(201).json({
      success: true,
      message: "Application received. We'll review it and get back to you.",
      data: partner,
    });
  } catch (error) {
    console.error("Partner application error:", error);
    return fail(res, 400, error.message);
  }
};

// Loads the logged-in user's verified partner profile, or responds with an error
const requireVerifiedPartner = async (req, res) => {
  const partner = await Partner.findOne({ user_id: req.user.user_id });
  if (!partner) {
    fail(res, 404, "You don't have a partner account.");
    return null;
  }
  if (partner.status !== "verified") {
    fail(res, 403, `Your partner account is ${partner.status}.`);
    return null;
  }
  return partner;
};

// Partner's own view of their record: admin's internal notes are hidden
const publicPartner = (partner) => {
  if (!partner) return null;
  const data = partner.toJSON();
  if (data.verificationChecks) delete data.verificationChecks.notes;
  delete data.verifiedBy;
  return data;
};

// GET /api/v1/partners/me
const getMyPartnerProfile = async (req, res) => {
  const partner = await Partner.findOne({ user_id: req.user.user_id });
  return res.json({ success: true, data: publicPartner(partner) });
};

// GET /api/v1/partners/me/jobs
const getMyJobs = async (req, res) => {
  try {
    const partner = await requireVerifiedPartner(req, res);
    if (!partner) return;

    const jobs = await Service.find({ "serviceProvider.providerId": String(partner._id) })
      .sort({ "booking.bookingDate": 1 })
      .lean();

    const earnings = jobs.reduce(
      (acc, j) => {
        if (j.payout?.status === "pending") acc.pending += j.payout.partnerAmount || 0;
        if (j.payout?.status === "paid") acc.paid += j.payout.partnerAmount || 0;
        return acc;
      },
      { pending: 0, paid: 0 }
    );

    return res.json({
      success: true,
      data: {
        partner: publicPartner(partner),
        jobs: jobs.map((j) => partnerJobView(j, partner.commissionRate ?? COMMISSION_RATE)),
        earnings,
      },
    });
  } catch (error) {
    console.error("Get partner jobs error:", error);
    return fail(res, 500, "Could not load your jobs.");
  }
};

// Moves a job assigned to the logged-in partner from one status to another
const partnerTransition = (from, to, extra = () => ({})) => async (req, res) => {
  try {
    const partner = await requireVerifiedPartner(req, res);
    if (!partner) return;

    const job = await Service.findById(req.params.id);
    if (!job || job.serviceProvider?.providerId !== String(partner._id)) {
      return fail(res, 404, "Job not found.");
    }
    if (!from.includes(job.booking.progress)) {
      return fail(res, 400, `This job is ${job.booking.progress}; it can't be moved to ${to}.`);
    }

    const update = { "booking.progress": to, ...extra(job, partner, req) };
    const updated = await Service.findByIdAndUpdate(job._id, { $set: update }, { new: true });

    if (to === "completed") {
      await Partner.updateOne({ _id: partner._id }, { $inc: { "stats.jobsCompleted": 1 } });
    }

    return res.json({ success: true, data: partnerJobView(updated) });
  } catch (error) {
    console.error(`Job ${to} error:`, error);
    return fail(res, 500, "Could not update this job.");
  }
};

// POST /api/v1/partners/jobs/:id/accept
const acceptJob = partnerTransition(["assigned"], "accepted", () => ({
  "serviceProvider.acceptedAt": new Date(),
}));

// POST /api/v1/partners/jobs/:id/start
const startJob = partnerTransition(["accepted"], "in_progress", () => ({
  "serviceProvider.startedAt": new Date(),
}));

// POST /api/v1/partners/jobs/:id/complete
const completeJob = partnerTransition(["in_progress"], "completed", (job, partner, req) => {
  const rate = partner.commissionRate ?? COMMISSION_RATE;
  const total = job.serviceRate || 0;
  const commissionAmount = Math.round(total * rate);
  return {
    "completion.completedAt": new Date(),
    "completion.completionNotes": req.body?.notes || "",
    "payout.status": "pending",
    "payout.commissionRate": rate,
    "payout.commissionAmount": commissionAmount,
    "payout.partnerAmount": total - commissionAmount,
  };
});

// POST /api/v1/partners/jobs/:id/decline — job goes back to the admin queue
const declineJob = async (req, res) => {
  try {
    const partner = await requireVerifiedPartner(req, res);
    if (!partner) return;

    const job = await Service.findById(req.params.id);
    if (!job || job.serviceProvider?.providerId !== String(partner._id)) {
      return fail(res, 404, "Job not found.");
    }
    if (job.booking.progress !== "assigned") {
      return fail(res, 400, "Only jobs you haven't accepted yet can be declined.");
    }

    await Service.updateOne(
      { _id: job._id },
      {
        $set: {
          "booking.progress": "confirmed",
          "serviceProvider.providerId": null,
          "serviceProvider.providerName": null,
          "serviceProvider.providerPhone": null,
          "serviceProvider.assignedAt": null,
        },
        $push: {
          "serviceProvider.declined": {
            providerId: String(partner._id),
            reason: req.body?.reason || "",
            at: new Date(),
          },
        },
      }
    );
    return res.json({ success: true, message: "Job declined." });
  } catch (error) {
    console.error("Decline job error:", error);
    return fail(res, 500, "Could not decline this job.");
  }
};

/* ======================= ADMIN ======================= */

// GET /api/v1/partners?status=pending
const listPartners = async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const partners = await Partner.find(filter).sort({ createdAt: -1 });
  return res.json({ success: true, data: partners });
};

// PATCH /api/v1/partners/:id/status  { status, note }
const setPartnerStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!["verified", "rejected", "suspended", "pending"].includes(status)) {
      return fail(res, 400, "Invalid status.");
    }
    const existing = await Partner.findById(req.params.id);
    if (!existing) return fail(res, 404, "Partner not found.");

    if (status === "verified") {
      const checks = existing.verificationChecks || {};
      const missing = REQUIRED_VERIFICATION_CHECKS.filter((c) => !checks[c]);
      if (missing.length) {
        return fail(res, 400, `Complete these checks before verifying: ${missing.join(", ")}.`);
      }
    }

    const update = { status, statusNote: note || "" };
    if (status === "verified") {
      update.verifiedAt = new Date();
      update.verifiedBy = req.user.user_id;
    }
    const partner = await Partner.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!partner) return fail(res, 404, "Partner not found.");

    // Partner accounts use the existing "provider" role
    await User.updateOne(
      { user_id: partner.user_id, role: { $ne: "admin" } },
      { $set: { role: status === "verified" ? "provider" : "user" } }
    );

    return res.json({ success: true, data: partner });
  } catch (error) {
    console.error("Set partner status error:", error);
    return fail(res, 500, "Could not update partner.");
  }
};

// PATCH /api/v1/partners/:id/checks  { idSeen: true, notes: "..." }
const updateVerificationChecks = async (req, res) => {
  const allowed = [
    "idSeen",
    "bankNameMatches",
    "guarantorCalled",
    "referencesCalled",
    "officeVisited",
    "cacChecked",
    "notes",
  ];
  const $set = {};
  for (const key of allowed) {
    if (key in req.body) {
      $set[`verificationChecks.${key}`] =
        key === "notes" ? String(req.body[key] || "") : Boolean(req.body[key]);
    }
  }
  if (!Object.keys($set).length) return fail(res, 400, "Nothing to update.");
  const partner = await Partner.findByIdAndUpdate(req.params.id, { $set }, { new: true });
  if (!partner) return fail(res, 404, "Partner not found.");
  return res.json({ success: true, data: partner });
};

// GET /api/v1/partners/admin/jobs?view=unassigned|active|payouts|all
const listJobsForAdmin = async (req, res) => {
  const views = {
    unassigned: { "booking.paymentStatus": "paid", "booking.progress": "confirmed" },
    active: { "booking.progress": { $in: ["assigned", "accepted", "in_progress", "completion_requested"] } },
    payouts: { "payout.status": "pending" },
    completed: { "booking.progress": "completed" },
    all: { "booking.paymentStatus": "paid" },
  };
  const filter = views[req.query.view] || views.unassigned;
  const sort = ["completed", "all"].includes(req.query.view)
    ? { updatedAt: -1 }
    : { "booking.bookingDate": 1 };
  const jobs = await Service.find(filter).sort(sort).limit(200).lean();
  return res.json({ success: true, data: jobs.map(jobView) });
};

// GET /api/v1/partners/admin/overview — numbers for the admin dashboard
const getAdminOverview = async (req, res) => {
  try {
    const [jobsByStatus, partnersByStatus, money, byArea, recent, paymentIssues] = await Promise.all([
      Service.aggregate([
        { $match: { "booking.paymentStatus": "paid" } },
        { $group: { _id: "$booking.progress", count: { $sum: 1 } } },
      ]),
      Partner.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Service.aggregate([
        { $match: { "booking.paymentStatus": "paid" } },
        {
          $group: {
            _id: null,
            gmv: { $sum: "$serviceRate" },
            paidBookings: { $sum: 1 },
            commission: { $sum: { $ifNull: ["$payout.commissionAmount", 0] } },
            payoutsPending: {
              $sum: {
                $cond: [{ $eq: ["$payout.status", "pending"] }, "$payout.partnerAmount", 0],
              },
            },
            payoutsPaid: {
              $sum: {
                $cond: [{ $eq: ["$payout.status", "paid"] }, "$payout.partnerAmount", 0],
              },
            },
          },
        },
      ]),
      Service.aggregate([
        { $match: { "booking.paymentStatus": "paid", "booking.area": { $ne: null } } },
        { $group: { _id: "$booking.area", bookings: { $sum: 1 }, value: { $sum: "$serviceRate" } } },
        { $sort: { bookings: -1 } },
      ]),
      Service.find({ "booking.paymentStatus": "paid" }).sort({ updatedAt: -1 }).limit(8).lean(),
      // Money Paystack took that doesn't match the booking: someone has to look at these
      Service.find({ "booking.payment.flag": "amount_mismatch", "booking.paymentStatus": "pending" }).sort({ updatedAt: -1 }).limit(20).lean(),
    ]);

    const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id || "unknown", r.count]));
    const totals = money[0] || {};

    return res.json({
      success: true,
      data: {
        district: LAUNCH_DISTRICT,
        commissionRate: COMMISSION_RATE,
        jobs: toMap(jobsByStatus),
        partners: toMap(partnersByStatus),
        money: {
          gmv: totals.gmv || 0,
          paidBookings: totals.paidBookings || 0,
          commission: totals.commission || 0,
          payoutsPending: totals.payoutsPending || 0,
          payoutsPaid: totals.payoutsPaid || 0,
        },
        byArea: byArea.map((a) => ({ area: a._id, bookings: a.bookings, value: a.value })),
        recent: recent.map(jobView),
        paymentIssues: paymentIssues.map((s) => ({
          id: s._id,
          service: s.serviceCategory || s.serviceName,
          customer: s.customerInfo?.name || "",
          expected: s.booking.payment.amount_charged_naira,
          note: s.booking.payment.flag_note,
          reference: s.booking.payment.reference,
          at: s.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return fail(res, 500, "Could not load overview.");
  }
};

// POST /api/v1/partners/admin/jobs/:id/assign  { partnerId }
const assignJob = async (req, res) => {
  try {
    const job = await Service.findById(req.params.id);
    if (!job) return fail(res, 404, "Job not found.");
    if (job.booking.paymentStatus !== "paid") {
      return fail(res, 400, "Only paid bookings can be assigned.");
    }
    if (!["confirmed", "assigned"].includes(job.booking.progress)) {
      return fail(res, 400, `This job is already ${job.booking.progress}.`);
    }

    const partner = await Partner.findById(req.body.partnerId);
    if (!partner || partner.status !== "verified") {
      return fail(res, 400, "Choose a verified partner.");
    }
    if (!partner.services.includes(job.serviceType)) {
      return fail(res, 400, `${partner.companyName} doesn't offer this service.`);
    }
    if (job.booking.area && !partner.areas.includes(job.booking.area)) {
      return fail(res, 400, `${partner.companyName} doesn't cover ${job.booking.area}.`);
    }

    const updated = await Service.findByIdAndUpdate(
      job._id,
      {
        $set: {
          "booking.progress": "assigned",
          "serviceProvider.providerId": String(partner._id),
          "serviceProvider.providerName": partner.companyName,
          "serviceProvider.providerPhone": partner.phone,
          "serviceProvider.assignedAt": new Date(),
          "serviceProvider.assignedBy": req.user.user_id,
        },
      },
      { new: true }
    );
    return res.json({ success: true, data: jobView(updated) });
  } catch (error) {
    console.error("Assign job error:", error);
    return fail(res, 500, "Could not assign this job.");
  }
};

// POST /api/v1/partners/admin/jobs/:id/team  { name, phone }
// Admin-run jobs: Kliner's own team is booked directly, so there is no offer to accept.
const assignTeam = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    if (name.length < 2) return fail(res, 400, "Enter the team or cleaner's name.");
    if (phone.replace(/\D/g, "").length < 7) return fail(res, 400, "Enter a valid phone number.");

    const job = await Service.findById(req.params.id);
    if (!job) return fail(res, 404, "Job not found.");
    if (job.booking.paymentStatus !== "paid") {
      return fail(res, 400, "Only paid bookings can be assigned.");
    }
    if (!["confirmed", "assigned", "accepted"].includes(job.booking.progress)) {
      return fail(res, 400, `This job is already ${job.booking.progress}.`);
    }

    const employeeIds = [...new Set((req.body?.employeeIds || []).map(String).filter(Boolean))];
    if (employeeIds.length === 0) {
      return fail(res, 400, "Select at least one employee from the roster.");
    }
    const employees = await Employee.find({ employee_id: { $in: employeeIds }, status: "active" });
    if (employees.length !== employeeIds.length) {
      return fail(res, 400, "One or more selected employees are missing or inactive.");
    }
    const assignedEmployees = employees.map((e) => ({
      employeeId: e.employee_id,
      firstName: e.firstName,
      lastName: e.lastName,
      profilePhotoUrl: e.profilePhoto?.url || "",
    }));

    const visitorCode = String(Math.floor(100000 + Math.random() * 900000));
    const now = new Date();
    const fieldToken = job.serviceProvider?.fieldToken || crypto.randomBytes(24).toString("hex");
    const updated = await Service.findByIdAndUpdate(
      job._id,
      {
        $set: {
          "booking.progress": "accepted",
          "serviceProvider.providerId": null,
          "serviceProvider.providerName": name,
          "serviceProvider.providerPhone": phone,
          "serviceProvider.assignedAt": job.serviceProvider?.assignedAt || now,
          "serviceProvider.assignedBy": req.user.user_id,
          "serviceProvider.acceptedAt": now,
          "serviceProvider.fieldToken": fieldToken,
          "serviceProvider.assignedEmployees": assignedEmployees,
          "customerSecurity.visitorCode": visitorCode,
        },
      },
      { new: true }
    );
    return res.json({ success: true, data: jobView(updated) });
  } catch (error) {
    console.error("Assign team error:", error);
    return fail(res, 500, "Could not assign this team.");
  }
};

// POST /api/v1/partners/admin/jobs/:id/progress  { status: "in_progress" | "completed" }
const updateJobProgress = async (req, res) => {
  try {
    const moves = {
      in_progress: { from: "accepted", set: () => ({ "serviceProvider.startedAt": new Date() }) },
      completed: { from: "completion_requested", set: () => ({ "completion.completedAt": new Date() }) },
    };
    const move = moves[req.body?.status];
    if (!move) return fail(res, 400, "Unknown status.");

    // When starting, the admin can set how long the work is expected to take
    let expected;
    if (req.body.status === "in_progress" && req.body.expectedMinutes !== undefined) {
      expected = req.body.expectedMinutes;
      if (!Number.isInteger(expected) || expected < 15 || expected > 4320) {
        return fail(res, 400, "Expected time must be between 15 minutes and 3 days.");
      }
    }

    const job = await Service.findById(req.params.id);
    if (!job) return fail(res, 404, "Job not found.");
    if (job.booking.progress !== move.from) {
      return fail(res, 400, `This job is ${job.booking.progress}; it can't be moved to ${req.body.status}.`);
    }

    const fieldToken =
      req.body.status === "in_progress" && job.serviceProvider?.providerName && !job.serviceProvider?.fieldToken
        ? crypto.randomBytes(24).toString("hex")
        : null;

    const updated = await Service.findByIdAndUpdate(
      job._id,
      {
        $set: {
          "booking.progress": req.body.status,
          ...(req.body.status === "in_progress"
            ? { "booking.expectedMinutes": expected || job.booking.expectedMinutes || defaultMinutes(job.serviceType) }
            : {}),
          ...(fieldToken ? { "serviceProvider.fieldToken": fieldToken } : {}),
          ...move.set(),
        },
      },
      { new: true }
    );
    return res.json({ success: true, data: jobView(updated) });
  } catch (error) {
    console.error("Job progress error:", error);
    return fail(res, 500, "Could not update this job.");
  }
};

// POST /api/v1/partners/admin/jobs/:id/expected  { expectedMinutes }
// Changes how long the work is expected to take, before or after it has started.
const setExpectedTime = async (req, res) => {
  try {
    const n = req.body?.expectedMinutes;
    if (!Number.isInteger(n) || n < 15 || n > 4320) return fail(res, 400, "Expected time must be between 15 minutes and 3 days.");
    const job = await Service.findById(req.params.id);
    if (!job) return fail(res, 404, "Job not found.");
    if (!["accepted", "in_progress"].includes(job.booking.progress)) {
      return fail(res, 400, `This job is ${job.booking.progress}, so its expected time can't be changed.`);
    }
    const updated = await Service.findByIdAndUpdate(job._id, { $set: { "booking.expectedMinutes": n } }, { new: true });
    return res.json({ success: true, data: jobView(updated) });
  } catch (error) {
    console.error("Expected time error:", error);
    return fail(res, 500, "Could not update this job.");
  }
};

const fieldJobView = (s) => ({
  id: s._id,
  serviceCategory: s.serviceCategory,
  serviceName: s.serviceName,
  serviceType: s.serviceType,
  status: s.booking?.progress,
  bookingDate: s.booking?.bookingDate,
  bookingTime: s.booking?.bookingTime,
  area: s.booking?.area,
  location: s.booking?.location,
  expectedMinutes: s.booking?.expectedMinutes || defaultMinutes(s.serviceType),
  team: s.serviceProvider?.providerName
    ? { name: s.serviceProvider.providerName, phone: s.serviceProvider.providerPhone }
    : null,
  customer: ["accepted", "in_progress", "completion_requested"].includes(s.booking?.progress)
    ? {
        name: s.customerInfo?.name,
        phone: s.customerInfo?.phone,
        notes: s.customerInfo?.notes,
      }
    : { name: s.customerInfo?.name },
  startedAt: s.serviceProvider?.startedAt,
  reports: (s.completion?.fieldReports || []).map((r) => ({
    message: r.message,
    photos: r.photos || [],
    at: r.createdAt,
  })),
  completionRequest:
    s.booking?.progress === "completion_requested"
      ? { requestedAt: s.completion?.requestedAt, notes: s.completion?.requestNotes || "" }
      : null,
  arrival: arrivalView(s),
  propertyRules: {
    belongings: true,
    limitedAccessNotes: s.customerSecurity?.accessNotes || "",
    limitedAccessAcknowledged: Boolean(s.customerSecurity?.limitedAccessAcknowledged),
  },
});

const loadJobByFieldToken = async (token) => {
  const t = String(token || "").trim();
  if (t.length < 16) return null;
  return Service.findOne({ "serviceProvider.fieldToken": t });
};

// GET /api/v1/partners/field/jobs/:token — assigned team field sheet (no login)
const getFieldJob = async (req, res) => {
  try {
    const job = await loadJobByFieldToken(req.params.token);
    if (!job) return fail(res, 404, "This job link isn't valid.");
    return res.json({ success: true, data: fieldJobView(job) });
  } catch (error) {
    console.error("Field job load error:", error);
    return fail(res, 500, "Could not load this job.");
  }
};

// POST /api/v1/partners/field/jobs/:token/reports  multipart: message, images[]
const addFieldReport = async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const files = req.files || [];
    if (message.length > 2000) return fail(res, 400, "Update is too long.");
    if (message.length < 3 && files.length === 0) {
      return fail(res, 400, "Write a short update or attach at least one photo.");
    }

    const job = await loadJobByFieldToken(req.params.token);
    if (!job) return fail(res, 404, "This job link isn't valid.");
    if (!["accepted", "in_progress", "completion_requested"].includes(job.booking.progress)) {
      return fail(res, 400, "This job is no longer open for updates.");
    }

    const kinds = ["update", "before", "after"];
    const reportKind = kinds.includes(req.body?.reportKind) ? req.body.reportKind : "update";

    let photos = [];
    if (files.length) {
      try {
        photos = await uploadBuffers(files);
      } catch (uploadErr) {
        console.error("Field photo upload error:", uploadErr);
        return fail(res, 500, "Could not upload photos. Try fewer or smaller images.");
      }
    }

    const updated = await Service.findByIdAndUpdate(
      job._id,
      { $push: { "completion.fieldReports": { message, photos, reportKind, createdAt: new Date() } } },
      { new: true }
    );
    return res.json({ success: true, data: fieldJobView(updated) });
  } catch (error) {
    console.error("Field report error:", error);
    return fail(res, 500, "Could not save your update.");
  }
};

// POST /api/v1/partners/field/jobs/:token/arrival — team lead records on-site arrival time
const recordTeamArrival = async (req, res) => {
  try {
    const job = await loadJobByFieldToken(req.params.token);
    if (!job) return fail(res, 404, "This job link isn't valid.");
    if (!["accepted", "in_progress", "completion_requested"].includes(job.booking.progress)) {
      return fail(res, 400, "This job is not open for arrival logging.");
    }
    const crew = job.serviceProvider?.assignedEmployees || [];
    if (!crew.length) return fail(res, 400, "No employees are assigned to this job.");

    const code = String(req.body?.visitorCode || "").trim();
    const expected = job.customerSecurity?.visitorCode;
    if (expected && code !== expected) {
      return fail(res, 400, "Visit code doesn't match this job. Ask the property owner for their code.");
    }
    if (!expected) {
      return fail(res, 400, "This job has no visit code yet. Ask admin to re-assign the team.");
    }

    const now = new Date();
    const arrivedAt = job.arrivalLog?.arrivedAt || now;
    const updated = await Service.findByIdAndUpdate(
      job._id,
      { $set: { "arrivalLog.arrivedAt": arrivedAt } },
      { new: true }
    );
    return res.json({ success: true, data: fieldJobView(updated) });
  } catch (error) {
    console.error("Record arrival error:", error);
    return fail(res, 500, "Could not record arrival.");
  }
};

// POST /api/v1/partners/field/jobs/:token/check-in  { employeeId }
const checkInEmployee = async (req, res) => {
  try {
    const employeeId = String(req.body?.employeeId || "").trim();
    if (!employeeId) return fail(res, 400, "Select your name from the roster.");

    const job = await loadJobByFieldToken(req.params.token);
    if (!job) return fail(res, 404, "This job link isn't valid.");
    if (!["accepted", "in_progress", "completion_requested"].includes(job.booking.progress)) {
      return fail(res, 400, "This job is not open for check-in.");
    }
    if (!job.arrivalLog?.arrivedAt) {
      return fail(res, 400, "Record team arrival first.");
    }

    const crew = job.serviceProvider?.assignedEmployees || [];
    const member = crew.find((e) => e.employeeId === employeeId);
    if (!member) return fail(res, 403, "You are not on the crew list for this job.");

    const already = (job.arrivalLog?.checkIns || []).some((c) => c.employeeId === employeeId);
    if (already) return fail(res, 400, "You have already confirmed your presence.");

    const name = `${member.firstName} ${member.lastName}`.trim();
    const updated = await Service.findByIdAndUpdate(
      job._id,
      {
        $push: {
          "arrivalLog.checkIns": { employeeId, name, checkedInAt: new Date() },
        },
      },
      { new: true }
    );
    return res.json({ success: true, data: fieldJobView(updated) });
  } catch (error) {
    console.error("Check-in error:", error);
    return fail(res, 500, "Could not confirm presence.");
  }
};

// POST /api/v1/partners/field/jobs/:token/request-completion  { notes? }
const requestFieldCompletion = async (req, res) => {
  try {
    const notes = String(req.body?.notes || "").trim();
    const job = await loadJobByFieldToken(req.params.token);
    if (!job) return fail(res, 404, "This job link isn't valid.");
    if (job.booking.progress !== "in_progress") {
      return fail(res, 400, "You can only mark a job complete once work is in progress.");
    }
  const arrival = arrivalView(job);
    if (!arrival.allCheckedIn) {
      return fail(res, 400, "Every assigned employee must confirm their presence before completing the job.");
    }

    const updated = await Service.findByIdAndUpdate(
      job._id,
      {
        $set: {
          "booking.progress": "completion_requested",
          "completion.requestedAt": new Date(),
          "completion.requestNotes": notes,
        },
      },
      { new: true }
    );
    return res.json({ success: true, data: fieldJobView(updated) });
  } catch (error) {
    console.error("Field completion request error:", error);
    return fail(res, 500, "Could not send completion request.");
  }
};

// POST /api/v1/partners/admin/jobs/:id/approve-completion
const approveCompletion = async (req, res) => {
  try {
    const job = await Service.findById(req.params.id);
    if (!job) return fail(res, 404, "Job not found.");
    if (job.booking.progress !== "completion_requested") {
      return fail(res, 400, "This job isn't waiting for completion approval.");
    }

    const updated = await Service.findByIdAndUpdate(
      job._id,
      {
        $set: {
          "booking.progress": "completed",
          "completion.completedAt": new Date(),
          ...(req.body?.notes ? { "completion.completionNotes": String(req.body.notes).trim() } : {}),
          "serviceProvider.fieldToken": null,
        },
      },
      { new: true }
    );
    return res.json({ success: true, data: jobView(updated) });
  } catch (error) {
    console.error("Approve completion error:", error);
    return fail(res, 500, "Could not approve completion.");
  }
};

// POST /api/v1/partners/admin/jobs/:id/reject-completion  { notes? }
const rejectCompletionRequest = async (req, res) => {
  try {
    const job = await Service.findById(req.params.id);
    if (!job) return fail(res, 404, "Job not found.");
    if (job.booking.progress !== "completion_requested") {
      return fail(res, 400, "This job isn't waiting for completion approval.");
    }

    const note = String(req.body?.notes || "").trim();
    const updated = await Service.findByIdAndUpdate(
      job._id,
      {
        $set: { "booking.progress": "in_progress" },
        ...(note
          ? {
              $push: {
                "completion.fieldReports": {
                  message: `Admin sent job back to in progress: ${note}`,
                  createdAt: new Date(),
                },
              },
            }
          : {}),
      },
      { new: true }
    );
    return res.json({ success: true, data: jobView(updated) });
  } catch (error) {
    console.error("Reject completion error:", error);
    return fail(res, 500, "Could not update this job.");
  }
};

// POST /api/v1/partners/admin/jobs/:id/payout  { transferReference }
// Phase 1: admin pays the partner by bank transfer, then records it here.
const markPayoutPaid = async (req, res) => {
  const job = await Service.findById(req.params.id);
  if (!job) return fail(res, 404, "Job not found.");
  if (job.payout?.status !== "pending") {
    return fail(res, 400, "This job has no pending payout.");
  }
  const updated = await Service.findByIdAndUpdate(
    job._id,
    {
      $set: {
        "payout.status": "paid",
        "payout.paidAt": new Date(),
        "payout.transferReference": req.body?.transferReference || "",
        "payout.paidBy": req.user.user_id,
      },
    },
    { new: true }
  );
  return res.json({ success: true, data: jobView(updated) });
};

module.exports = {
  getServiceAreas,
  applyAsPartner,
  getMyPartnerProfile,
  getMyJobs,
  acceptJob,
  declineJob,
  startJob,
  completeJob,
  listPartners,
  setPartnerStatus,
  updateVerificationChecks,
  getAdminOverview,
  listJobsForAdmin,
  assignJob,
  assignTeam,
  updateJobProgress,
  setExpectedTime,
  markPayoutPaid,
  getFieldJob,
  addFieldReport,
  recordTeamArrival,
  checkInEmployee,
  requestFieldCompletion,
  approveCompletion,
  rejectCompletionRequest,
};
