// How long a job is expected to take, in minutes. These are starting points: the admin can change
// the time when starting a job, and every number here is easy to tune.
const round15 = (m) => Math.max(15, Math.round(m / 15) * 15);
const count = (obj) => Object.values(obj || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

// Used for older bookings that were made before durations were stored
const DEFAULT_MINUTES = { house_cleaning: 180, laundry: 1440, move_out: 240, repairs: 120, gardening: 180 };
const defaultMinutes = (serviceType) => DEFAULT_MINUTES[serviceType] || 180;

const estimateMinutes = (serviceType, data = {}) => {
  switch (serviceType) {
    case "house_cleaning": {
      const base = { "Standard Cleaning": 120, "Deep Cleaning": 240, "Move-in Cleaning": 300, "Move-out Cleaning": 300 }[data.category] ?? 150;
      const pack = { "Basic Package": 0.8, "Standard Package": 1, "Premium Package": 1.3, "Luxury Package": 1.6 }[data.package] ?? 1;
      const size = { studio: 0.7, small: 1, medium: 1.3, large: 1.8 }[data.homeSize] ?? 1;
      return round15((base + 15 * count(data.items)) * pack * size);
    }
    case "laundry":
      // pick-up, wash, return: about a day, longer when ironing is included
      return 1440 + (/iron/i.test(String(data.option || data.service || "")) ? 360 : 0);
    case "move_out":
      return round15(180 + 30 * count(data.rooms || data.items));
    case "repairs":
      return { plumbing: 120, electrical: 120, appliance: 120, carpentry: 180, painting: 360, general: 90 }[data.repairType] ?? 120;
    case "gardening": {
      const size = { small: 120, medium: 180, large: 300, xlarge: 480 }[data.gardenSize] ?? 180;
      const extra = Math.max(0, (Array.isArray(data.services) ? data.services.length : 1) - 1) * 20;
      return round15(size + extra);
    }
    default:
      return 180;
  }
};

module.exports = { estimateMinutes, defaultMinutes };
