// ============================================================
// KLINER PRICING — single source of truth. All amounts in NAIRA (₦).
//
// The frontend keeps an identical copy at Kliner-Web-App/utils/pricing.js
// for showing estimates. The backend ALWAYS recalculates with this file
// before charging, so a tampered/old frontend price can never be charged.
// If you change a number here, change it in the frontend copy too.
// ============================================================

const PRICING = {
  house_cleaning: {
    categories: {
      "Standard Cleaning": { basePrice: 8000, pricePerRoom: 1200 },
      "Deep Cleaning": { basePrice: 15000, pricePerRoom: 2000 },
      "Move-in Cleaning": { basePrice: 20000, pricePerRoom: 2500 },
      "Move-out Cleaning": { basePrice: 22000, pricePerRoom: 2800 },
    },
    packages: {
      "Basic Package": 0.8,
      "Standard Package": 1,
      "Premium Package": 1.4,
      "Luxury Package": 1.8,
    },
    homeSizes: { studio: 0.7, small: 1, medium: 1.5, large: 2.2 },
    // percentage discounts
    frequencies: { "one-time": 0, monthly: 0.05, "bi-weekly": 0.1, weekly: 0.15 },
  },

  laundry: {
    // price per pickup (one laundry bag, up to ~15 items)
    options: {
      "washed-folded": { title: "Washed and Folded", price: 4000 },
      "washed-ironed": { title: "Washed and Ironed", price: 5500 },
      "washed-ironed-folded": { title: "Washed, Ironed, and Folded", price: 7000 },
    },
  },

  move_out: {
    basePrice: 15000, // truck + crew call-out
    pricePerRoom: 5000,
  },

  repairs: {
    // call-out / inspection fee per repair type
    types: {
      plumbing: 6000,
      electrical: 6000,
      appliance: 7500,
      carpentry: 7000,
      painting: 10000,
      general: 5000,
    },
    urgency: { standard: 0, priority: 2000, emergency: 5000 },
  },

  gardening: {
    gardenSizes: { small: 5000, medium: 8500, large: 12000, xlarge: 18000 },
    // flat naira discount per visit
    frequencies: { "one-time": 0, "bi-weekly": 500, weekly: 1000, monthly: 250 },
  },
};

const SERVICE_TYPES = Object.keys(PRICING);

// Frontend used "biweekly" in some places; the database expects "bi-weekly"
const normalizeFrequency = (f) => (f === "biweekly" ? "bi-weekly" : f || "one-time");

const sumCounts = (obj) =>
  Object.values(obj || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

const result = (basePrice, additionalCharges = [], discounts = []) => {
  const subtotal =
    basePrice + additionalCharges.reduce((s, c) => s + c.amount, 0);
  const discountTotal = discounts.reduce((s, d) => s + d.amount, 0);
  const total = Math.max(0, Math.round(subtotal - discountTotal));
  return { basePrice, additionalCharges, discounts, subtotal: Math.round(subtotal), total };
};

const EMPTY = result(0);

/**
 * Calculate the price of a booking in naira.
 * @returns {{basePrice:number, additionalCharges:{description:string,amount:number}[],
 *            discounts:{description:string,amount:number}[], subtotal:number, total:number}}
 */
const calculatePrice = (serviceType, data = {}) => {
  switch (serviceType) {
    case "house_cleaning": {
      const p = PRICING.house_cleaning;
      const cat = p.categories[data.category || "Standard Cleaning"];
      const pkg = p.packages[data.package || "Standard Package"];
      const size = p.homeSizes[data.homeSize || "small"];
      const freq = p.frequencies[normalizeFrequency(data.frequency)];
      const rooms = sumCounts(data.items);
      if (!cat || pkg === undefined || size === undefined || freq === undefined || rooms === 0)
        return EMPTY;

      const roomsCost = rooms * cat.pricePerRoom;
      const raw = cat.basePrice + roomsCost;
      const withMultipliers = raw * pkg * size;
      const adjustments = [];
      if (withMultipliers !== raw)
        adjustments.push({
          description: `${data.package || "Standard Package"}, ${data.homeSize || "small"} home`,
          amount: Math.round(withMultipliers - raw),
        });
      const discounts = freq
        ? [{ description: `${normalizeFrequency(data.frequency)} discount (${freq * 100}%)`, amount: Math.round(withMultipliers * freq) }]
        : [];
      return result(
        cat.basePrice,
        [{ description: `${rooms} room${rooms > 1 ? "s" : ""} × ₦${cat.pricePerRoom.toLocaleString()}`, amount: roomsCost }, ...adjustments],
        discounts
      );
    }

    case "laundry": {
      const opt =
        PRICING.laundry.options[data.option] ||
        Object.values(PRICING.laundry.options).find((o) => o.title === data.service);
      return opt ? result(opt.price) : EMPTY;
    }

    case "move_out": {
      const p = PRICING.move_out;
      const rooms = sumCounts(data.rooms);
      if (rooms === 0) return EMPTY;
      return result(p.basePrice, [
        { description: `${rooms} room${rooms > 1 ? "s" : ""} × ₦${p.pricePerRoom.toLocaleString()}`, amount: rooms * p.pricePerRoom },
      ]);
    }

    case "repairs": {
      const p = PRICING.repairs;
      const base = p.types[data.repairType];
      const urgent = p.urgency[data.urgency || "standard"];
      if (base === undefined || urgent === undefined) return EMPTY;
      return result(
        base,
        urgent ? [{ description: `${data.urgency} request`, amount: urgent }] : []
      );
    }

    case "gardening": {
      const p = PRICING.gardening;
      const base = p.gardenSizes[data.gardenSize];
      const freq = normalizeFrequency(data.frequency);
      const off = p.frequencies[freq];
      if (base === undefined || off === undefined || !(data.services || []).length)
        return EMPTY;
      return result(base, [], off ? [{ description: `${freq} discount`, amount: off }] : []);
    }

    default:
      return EMPTY;
  }
};

/** Lowest typical price for a service — used for "From ₦X" labels. */
const startingPrice = (serviceType) =>
  ({
    house_cleaning: calculatePrice("house_cleaning", { items: { room: 1 } }).total,
    laundry: Math.min(...Object.values(PRICING.laundry.options).map((o) => o.price)),
    move_out: PRICING.move_out.basePrice + PRICING.move_out.pricePerRoom,
    repairs: Math.min(...Object.values(PRICING.repairs.types)),
    gardening: Math.min(...Object.values(PRICING.gardening.gardenSizes)),
  })[serviceType] || 0;

const formatNaira = (amount) =>
  `₦${Math.round(Number(amount) || 0).toLocaleString("en-NG")}`;

module.exports = {
  PRICING,
  SERVICE_TYPES,
  calculatePrice,
  startingPrice,
  formatNaira,
  normalizeFrequency,
};
