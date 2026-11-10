// Where Paystack sends the customer after paying. It should be the address the customer is
// really using (a dev server may be on any port), but only an address we recognise, so nobody
// can use a booking to send a customer to another site.
const KNOWN = ["https://www.klinner.net.ng", "https://klinner-web-app.vercel.app"];

const fallbackOrigin = () => {
  const base = (process.env.FRONTEND_URL || "http://localhost:3000").trim();
  try {
    return new URL(base).origin;
  } catch {
    return "http://localhost:3000";
  }
};

const safeReturnOrigin = (candidate) => {
  const fallback = fallbackOrigin();
  if (typeof candidate !== "string") return fallback;
  let origin;
  try {
    origin = new URL(candidate).origin;
  } catch {
    return fallback;
  }
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/.test(origin);
  return local || KNOWN.includes(origin) || origin === fallback ? origin : fallback;
};

module.exports = { safeReturnOrigin };
