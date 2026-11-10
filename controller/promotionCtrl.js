// Home-screen promotions: the admin writes them, customers read the live ones.
const mongoose = require("mongoose");
const Promotion = require("../model/promotion");

const SERVICES = ["cleaning", "laundry", "moving", "gardening", "repairs"];
const THEMES = ["purple", "violet", "night"];
const ARTS = ["none", ...SERVICES];
const MAX_PROMOTIONS = 30;

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const clean = (value) => value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

const statusOf = (p, now = new Date()) => {
  if (!p.active) return "off";
  if (p.startsAt && p.startsAt > now) return "scheduled";
  if (p.endsAt && p.endsAt <= now) return "ended";
  return "live";
};

const adminView = (p) => ({
  id: p._id,
  title: p.title,
  description: p.description,
  badge: p.badge,
  theme: p.theme,
  art: p.art,
  service: p.service,
  active: p.active,
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  sortOrder: p.sortOrder,
  status: statusOf(p),
  updatedAt: p.updatedAt,
});

// Customers get only what they need to draw the banner
const publicView = (p) => ({
  id: p._id,
  title: p.title,
  description: p.description,
  badge: p.badge,
  theme: p.theme,
  art: p.art,
  service: p.service,
});

// Returns { data } with only trusted, correctly typed values, or { error }
const parse = (body, { partial }) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send the promotion details as JSON." };
  const data = {};
  const has = (key) => body[key] !== undefined;

  const str = (key, label, { min = 0, max }) => {
    if (!has(key)) return true;
    if (typeof body[key] !== "string") return `${label} must be text.`;
    const value = clean(body[key]);
    if (value.length < min || value.length > max) return `${label} must be ${min ? `${min}–` : "up to "}${max} characters.`;
    data[key] = value;
    return true;
  };
  const pick = (key, label, allowed) => {
    if (!has(key)) return true;
    if (typeof body[key] !== "string" || !allowed.includes(body[key])) return `${label} isn't one of the available choices.`;
    data[key] = body[key];
    return true;
  };

  if (!partial && !has("title")) return { error: "A title is required." };
  const checks = [
    str("title", "Title", { min: 3, max: 60 }),
    str("description", "Description", { max: 140 }),
    str("badge", "Badge", { max: 16 }),
    pick("theme", "Colour", THEMES),
    pick("art", "Picture", ARTS),
    pick("service", "Book-now target", ["", ...SERVICES]),
  ];
  const problem = checks.find((c) => c !== true);
  if (problem) return { error: problem };

  if (has("active")) {
    if (typeof body.active !== "boolean") return { error: "Active must be true or false." };
    data.active = body.active;
  }
  if (has("sortOrder")) {
    const n = body.sortOrder;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 9999) return { error: "Order must be a whole number from 0 to 9999." };
    data.sortOrder = n;
  }
  for (const key of ["startsAt", "endsAt"]) {
    if (!has(key)) continue;
    if (body[key] === null || body[key] === "") {
      data[key] = null;
    } else if (typeof body[key] === "string" && !Number.isNaN(Date.parse(body[key]))) {
      data[key] = new Date(body[key]);
    } else {
      return { error: `${key === "startsAt" ? "Start" : "End"} date isn't valid.` };
    }
  }
  return { data };
};

const datesOrder = (a, b) => !(a && b) || b > a;

// GET /api/v1/promotions  (public: what customers see right now)
const listPublic = async (req, res) => {
  try {
    const now = new Date();
    const rows = await Promotion.find({
      active: true,
      $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }],
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(8)
      .lean();
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: rows.map(publicView) });
  } catch (error) {
    console.error("List promotions error:", error);
    return fail(res, 500, "Could not load promotions.");
  }
};

// GET /api/v1/promotions/admin
const listAdmin = async (req, res) => {
  try {
    const rows = await Promotion.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
    return res.json({ success: true, data: rows.map(adminView) });
  } catch (error) {
    console.error("List promotions (admin) error:", error);
    return fail(res, 500, "Could not load promotions.");
  }
};

// POST /api/v1/promotions
const create = async (req, res) => {
  try {
    const { data, error } = parse(req.body, { partial: false });
    if (error) return fail(res, 400, error);
    if (!datesOrder(data.startsAt, data.endsAt)) return fail(res, 400, "The end date must be after the start date.");

    if ((await Promotion.countDocuments()) >= MAX_PROMOTIONS) {
      return fail(res, 400, `You can keep up to ${MAX_PROMOTIONS} promotions. Delete some that have ended first.`);
    }
    if (data.sortOrder === undefined) {
      const last = await Promotion.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
      data.sortOrder = last ? last.sortOrder + 1 : 0;
    }

    const promo = await Promotion.create({ ...data, createdBy: req.user?.user_id || "" });
    return res.status(201).json({ success: true, data: adminView(promo) });
  } catch (error) {
    console.error("Create promotion error:", error);
    return fail(res, 500, "Could not save this promotion.");
  }
};

// PUT /api/v1/promotions/:id  (send only what changes)
const update = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Promotion not found.");
    const { data, error } = parse(req.body, { partial: true });
    if (error) return fail(res, 400, error);

    const promo = await Promotion.findById(req.params.id);
    if (!promo) return fail(res, 404, "Promotion not found.");

    const startsAt = data.startsAt !== undefined ? data.startsAt : promo.startsAt;
    const endsAt = data.endsAt !== undefined ? data.endsAt : promo.endsAt;
    if (!datesOrder(startsAt, endsAt)) return fail(res, 400, "The end date must be after the start date.");

    promo.set(data);
    await promo.save();
    return res.json({ success: true, data: adminView(promo) });
  } catch (error) {
    console.error("Update promotion error:", error);
    return fail(res, 500, "Could not save this promotion.");
  }
};

// DELETE /api/v1/promotions/:id
const remove = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "Promotion not found.");
    const gone = await Promotion.findByIdAndDelete(req.params.id);
    if (!gone) return fail(res, 404, "Promotion not found.");
    return res.json({ success: true });
  } catch (error) {
    console.error("Delete promotion error:", error);
    return fail(res, 500, "Could not delete this promotion.");
  }
};

module.exports = { listPublic, listAdmin, create, update, remove };
