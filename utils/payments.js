// One place that decides "was this booking really paid?". The customer's browser, Paystack's
// webhook and the background checker all go through settlePayment, so they can't disagree
// and a payment is only ever recorded once.
const axios = require("axios");
const Service = require("../model/house");

const secret = () => process.env.PAYSTACK_SECRET_KEY;

// Paystack couldn't be reached (network down, timeout, 5xx). The right response is "try again".
class PaystackUnavailable extends Error {}

const fetchTransaction = async (reference) => {
  try {
    const response = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret()}` },
      timeout: 15000,
    });
    return response.data.data;
  } catch (error) {
    // Paystack answered "no such transaction": a final answer, not an outage
    if (error.response && error.response.status >= 400 && error.response.status < 500) return { notFound: true };
    throw new PaystackUnavailable(error.message);
  }
};

/**
 * Looks at one booking's payment and, if Paystack confirms it in full, records it as paid.
 * Safe to call any number of times, from any number of places at once.
 *
 * Returns { outcome, service?, status?, already? } where outcome is one of:
 *   paid               recorded (already: true if it was recorded earlier)
 *   unknown_reference  no booking has this reference
 *   not_found          Paystack doesn't know the reference
 *   not_paid           Paystack says it isn't paid (abandoned, failed, still open)
 *   mismatch           Paystack took money, but not the amount/currency we expected
 * Throws PaystackUnavailable when Paystack can't be reached.
 */
const settlePayment = async (reference, { tx = null } = {}) => {
  const service = await Service.findOne({ "booking.payment.reference": reference });
  if (!service) return { outcome: "unknown_reference" };
  if (service.booking.paymentStatus === "paid") return { outcome: "paid", service, already: true };

  const data = tx || (await fetchTransaction(reference));
  if (data.notFound) return { outcome: "not_found", service };
  if (data.status !== "success") return { outcome: "not_paid", status: data.status, service };

  const expected = service.booking.payment.amount_charged_kobo;
  const problems = [];
  if (data.reference && data.reference !== reference) problems.push("reference doesn't match");
  if (data.currency && data.currency !== "NGN") problems.push(`currency was ${data.currency}`);
  if (data.amount !== expected) problems.push(`paid ${data.amount} kobo, expected ${expected}`);
  if (problems.length) {
    await Service.updateOne(
      { _id: service._id },
      { $set: { "booking.payment.flag": "amount_mismatch", "booking.payment.flag_note": problems.join("; ") } }
    );
    console.error(`⚠️ Payment ${reference} needs review: ${problems.join("; ")}`);
    return { outcome: "mismatch", service };
  }

  // Only the first caller changes anything; everyone else gets "already paid"
  const updated = await Service.findOneAndUpdate(
    { _id: service._id, "booking.paymentStatus": { $ne: "paid" } },
    {
      $set: {
        "booking.paymentStatus": "paid",
        "booking.progress": "confirmed",
        "booking.payment.verified_at": new Date(),
        "booking.payment.paystack_transaction_id": String(data.id ?? ""),
        "booking.payment.paid_amount_kobo": data.amount,
        "booking.payment.paid_amount_naira": data.amount / 100,
      },
      $unset: { "booking.payment.flag": 1, "booking.payment.flag_note": 1 },
    },
    { new: true }
  );
  if (updated) return { outcome: "paid", service: updated };
  return { outcome: "paid", service: await Service.findById(service._id), already: true };
};

/**
 * Safety net for payments whose customer never came back (closed the tab, lost signal) and
 * whose webhook didn't arrive: re-checks recent unpaid bookings with Paystack.
 */
let sweeping = false;
const reconcilePendingPayments = async ({ minAgeMs = 3 * 60 * 1000, maxAgeMs = 72 * 3600 * 1000, limit = 50 } = {}) => {
  if (sweeping) return { skipped: true };
  sweeping = true;
  const stats = { checked: 0, paid: 0, stillPending: 0, needsReview: 0, unavailable: false };
  try {
    const now = Date.now();
    const rows = await Service.find({
      "booking.paymentStatus": "pending",
      "booking.payment.reference": { $exists: true },
      createdAt: { $lte: new Date(now - minAgeMs), $gte: new Date(now - maxAgeMs) },
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .select("booking.payment.reference");

    for (const row of rows) {
      try {
        const result = await settlePayment(row.booking.payment.reference);
        stats.checked += 1;
        if (result.outcome === "paid") stats.paid += 1;
        else if (result.outcome === "mismatch") stats.needsReview += 1;
        else stats.stillPending += 1;
      } catch (error) {
        if (error instanceof PaystackUnavailable) {
          stats.unavailable = true; // no point trying the rest; the next run will
          break;
        }
        console.error("Payment check failed:", error.message);
      }
    }
  } finally {
    sweeping = false;
  }
  return stats;
};

const startPaymentSweeper = ({ everyMs = 5 * 60 * 1000 } = {}) => {
  const run = () =>
    reconcilePendingPayments()
      .then((s) => (s.paid || s.needsReview) && console.log("💳 Payment check:", JSON.stringify(s)))
      .catch((e) => console.error("Payment check error:", e.message));
  setTimeout(run, 30 * 1000).unref();
  return setInterval(run, everyMs).unref();
};

module.exports = { PaystackUnavailable, fetchTransaction, settlePayment, reconcilePendingPayments, startPaymentSweeper };
