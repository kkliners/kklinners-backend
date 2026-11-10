const mongoose = require("mongoose");

// A banner on the customer home screen, managed by the admin.
// It is content only: it never changes what a booking costs.
const promotionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 140, default: "" },
    badge: { type: String, trim: true, maxlength: 16, default: "" }, // the big label, e.g. "30% OFF"
    theme: { type: String, enum: ["purple", "violet", "night"], default: "purple" },
    art: { type: String, enum: ["none", "cleaning", "laundry", "moving", "gardening", "repairs"], default: "none" },
    service: { type: String, enum: ["", "cleaning", "laundry", "moving", "gardening", "repairs"], default: "" }, // "Book now" target
    active: { type: Boolean, default: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

promotionSchema.index({ active: 1, sortOrder: 1 });

module.exports = mongoose.model("Promotion", promotionSchema);
