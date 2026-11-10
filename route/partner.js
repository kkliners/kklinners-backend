// routes/partner.js — marketplace partners and job assignment
const express = require("express");
const router = express.Router();
const { authMiddleware, isAdmin } = require("../middleware/authMiddleware");
const ctrl = require("../controller/partnerCtrl");
const { uploadFieldReportImages } = require("../utils/uploadFieldImages");

// Public
router.get("/areas", ctrl.getServiceAreas);

// Assigned team field updates (magic link — no login)
router.get("/field/jobs/:token", ctrl.getFieldJob);
router.post("/field/jobs/:token/reports", (req, res, next) => {
  uploadFieldReportImages(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || "Invalid upload." });
    next();
  });
}, ctrl.addFieldReport);
router.post("/field/jobs/:token/arrival", ctrl.recordTeamArrival);
router.post("/field/jobs/:token/check-in", ctrl.checkInEmployee);
router.post("/field/jobs/:token/request-completion", ctrl.requestFieldCompletion);

// Partner (any logged-in user can apply; job routes need a verified partner)
router.post("/apply", authMiddleware, ctrl.applyAsPartner);
router.get("/me", authMiddleware, ctrl.getMyPartnerProfile);
router.get("/me/jobs", authMiddleware, ctrl.getMyJobs);
router.post("/jobs/:id/accept", authMiddleware, ctrl.acceptJob);
router.post("/jobs/:id/decline", authMiddleware, ctrl.declineJob);
router.post("/jobs/:id/start", authMiddleware, ctrl.startJob);
router.post("/jobs/:id/complete", authMiddleware, ctrl.completeJob);

// Admin
router.get("/admin/overview", authMiddleware, isAdmin, ctrl.getAdminOverview);
router.get("/admin/jobs", authMiddleware, isAdmin, ctrl.listJobsForAdmin);
router.post("/admin/jobs/:id/assign", authMiddleware, isAdmin, ctrl.assignJob);
router.post("/admin/jobs/:id/team", authMiddleware, isAdmin, ctrl.assignTeam);
router.post("/admin/jobs/:id/progress", authMiddleware, isAdmin, ctrl.updateJobProgress);
router.post("/admin/jobs/:id/approve-completion", authMiddleware, isAdmin, ctrl.approveCompletion);
router.post("/admin/jobs/:id/reject-completion", authMiddleware, isAdmin, ctrl.rejectCompletionRequest);
router.post("/admin/jobs/:id/expected", authMiddleware, isAdmin, ctrl.setExpectedTime);
router.post("/admin/jobs/:id/payout", authMiddleware, isAdmin, ctrl.markPayoutPaid);
router.get("/", authMiddleware, isAdmin, ctrl.listPartners);
router.patch("/:id/status", authMiddleware, isAdmin, ctrl.setPartnerStatus);
router.patch("/:id/checks", authMiddleware, isAdmin, ctrl.updateVerificationChecks);

module.exports = router;
