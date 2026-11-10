const Employee = require("../model/employee");
const { uploadBuffers, uploadOneFile } = require("../utils/uploadFieldImages");

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const maskBvn = (bvn) => (bvn && bvn.length >= 4 ? `*******${bvn.slice(-4)}` : "");

const listView = (e) => ({
  id: e._id,
  employee_id: e.employee_id,
  firstName: e.firstName,
  lastName: e.lastName,
  fullName: `${e.firstName} ${e.lastName}`.trim(),
  phone: e.phone,
  bvnMasked: maskBvn(e.bvn),
  profilePhotoUrl: e.profilePhoto?.url || "",
  documentCount: (e.documents || []).length,
  status: e.status,
  updatedAt: e.updatedAt,
});

const detailView = (e) => ({
  ...listView(e),
  bvn: e.bvn,
  notes: e.notes || "",
  documents: (e.documents || []).map((d) => ({
    id: d._id,
    docType: d.docType,
    label: d.label,
    url: d.url,
    mimeType: d.mimeType || "image/jpeg",
    uploadedAt: d.uploadedAt,
  })),
});

const listEmployees = async (req, res) => {
  const activeOnly = req.query.active !== "false";
  const filter = activeOnly ? { status: "active" } : {};
  const rows = await Employee.find(filter).sort({ firstName: 1, lastName: 1 }).limit(500);
  return res.json({ success: true, data: rows.map(listView) });
};

const getEmployee = async (req, res) => {
  const e = await Employee.findOne({ employee_id: req.params.employeeId });
  if (!e) return fail(res, 404, "Employee not found.");
  return res.json({ success: true, data: detailView(e) });
};

const createEmployee = async (req, res) => {
  const firstName = String(req.body?.firstName || "").trim();
  const lastName = String(req.body?.lastName || "").trim();
  const phone = String(req.body?.phone || "").trim();
  const bvn = String(req.body?.bvn || "").replace(/\D/g, "");
  const notes = String(req.body?.notes || "").trim();

  if (firstName.length < 2 || lastName.length < 2) {
    return fail(res, 400, "Enter the employee's first and last name.");
  }
  if (!/^\d{11}$/.test(bvn)) return fail(res, 400, "BVN must be 11 digits.");

  const exists = await Employee.findOne({ bvn });
  if (exists) return fail(res, 409, "An employee with this BVN is already on the roster.");

  const e = await Employee.create({ firstName, lastName, phone, bvn, notes });
  return res.status(201).json({ success: true, data: detailView(e) });
};

const updateEmployee = async (req, res) => {
  const e = await Employee.findOne({ employee_id: req.params.employeeId });
  if (!e) return fail(res, 404, "Employee not found.");

  const $set = {};
  if (req.body.firstName !== undefined) $set.firstName = String(req.body.firstName).trim();
  if (req.body.lastName !== undefined) $set.lastName = String(req.body.lastName).trim();
  if (req.body.phone !== undefined) $set.phone = String(req.body.phone).trim();
  if (req.body.notes !== undefined) $set.notes = String(req.body.notes).trim();
  if (req.body.status !== undefined && ["active", "inactive"].includes(req.body.status)) {
    $set.status = req.body.status;
  }
  if (req.body.bvn !== undefined) {
    const bvn = String(req.body.bvn).replace(/\D/g, "");
    if (!/^\d{11}$/.test(bvn)) return fail(res, 400, "BVN must be 11 digits.");
    const clash = await Employee.findOne({ bvn, employee_id: { $ne: e.employee_id } });
    if (clash) return fail(res, 409, "Another employee already uses this BVN.");
    $set.bvn = bvn;
  }

  const updated = await Employee.findByIdAndUpdate(e._id, { $set }, { new: true });
  return res.json({ success: true, data: detailView(updated) });
};

const uploadPhoto = async (req, res) => {
  const e = await Employee.findOne({ employee_id: req.params.employeeId });
  if (!e) return fail(res, 404, "Employee not found.");
  if (!req.file?.buffer) return fail(res, 400, "Choose a photo to upload.");

  let url;
  try {
    [url] = await uploadBuffers([req.file], "employees");
  } catch (err) {
    console.error("Employee photo upload:", err);
    return fail(res, 500, "Could not upload photo.");
  }

  const updated = await Employee.findByIdAndUpdate(
    e._id,
    { $set: { "profilePhoto.url": url, "profilePhoto.publicId": "" } },
    { new: true }
  );
  return res.json({ success: true, data: detailView(updated) });
};

const uploadDocument = async (req, res) => {
  const e = await Employee.findOne({ employee_id: req.params.employeeId });
  if (!e) return fail(res, 404, "Employee not found.");
  if (!req.file?.buffer) return fail(res, 400, "Choose a file to upload.");

  const docType = String(req.body?.docType || "other");
  const label = String(req.body?.label || "").trim();
  const allowed = ["nin", "voters_card", "drivers_licence", "passport", "contract", "other"];

  const mime = req.file.mimetype || "";
  if (!mime.startsWith("image/") && mime !== "application/pdf") {
    return fail(res, 400, "Upload a photo (JPG, PNG) or a PDF.");
  }

  let url;
  let mimeType;
  try {
    ({ url, mimeType } = await uploadOneFile(req.file, "employeeDocs"));
  } catch (err) {
    console.error("Employee doc upload:", err);
    return fail(res, 500, "Could not upload document.");
  }

  const updated = await Employee.findByIdAndUpdate(
    e._id,
    {
      $push: {
        documents: {
          docType: allowed.includes(docType) ? docType : "other",
          label,
          url,
          mimeType,
          uploadedAt: new Date(),
        },
      },
    },
    { new: true }
  );
  return res.json({ success: true, data: detailView(updated) });
};

module.exports = {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  uploadPhoto,
  uploadDocument,
};
