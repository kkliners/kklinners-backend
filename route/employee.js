const express = require("express");
const multer = require("multer");
const { authMiddleware, isAdmin } = require("../middleware/authMiddleware");
const ctrl = require("../controller/employeeCtrl");

const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) cb(null, true);
    else cb(new Error("Profile photo must be an image."));
  },
});

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype?.startsWith("image/") || file.mimetype === "application/pdf";
    if (ok) cb(null, true);
    else cb(new Error("Documents must be an image or PDF."));
  },
});

const router = express.Router();
router.get("/", authMiddleware, isAdmin, ctrl.listEmployees);
router.get("/:employeeId", authMiddleware, isAdmin, ctrl.getEmployee);
router.post("/", authMiddleware, isAdmin, ctrl.createEmployee);
router.patch("/:employeeId", authMiddleware, isAdmin, ctrl.updateEmployee);
router.post("/:employeeId/photo", authMiddleware, isAdmin, uploadPhoto.single("image"), ctrl.uploadPhoto);
router.post(
  "/:employeeId/documents",
  authMiddleware,
  isAdmin,
  uploadDocument.single("image"),
  ctrl.uploadDocument
);

module.exports = router;
