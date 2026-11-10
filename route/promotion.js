// routes/promotion.js — home-screen promotions
const express = require("express");
const router = express.Router();
const { authMiddleware, isAdmin } = require("../middleware/authMiddleware");
const ctrl = require("../controller/promotionCtrl");

// Public: what customers see now
router.get("/", ctrl.listPublic);

// Admin
router.get("/admin", authMiddleware, isAdmin, ctrl.listAdmin);
router.post("/", authMiddleware, isAdmin, ctrl.create);
router.put("/:id", authMiddleware, isAdmin, ctrl.update);
router.delete("/:id", authMiddleware, isAdmin, ctrl.remove);

module.exports = router;
