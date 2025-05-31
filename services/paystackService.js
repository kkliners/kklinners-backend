// services/paystackService.js
const axios = require("axios");
const crypto = require("crypto");

class PaystackService {
  constructor() {
    this.API_URL = "https://api.paystack.co";
    this.API_KEY = process.env.PAYSTACK_SECRET_KEY;
    this.timeout = 30000; // 30 seconds timeout

    if (!this.API_KEY) {
      throw new Error("PAYSTACK_SECRET_KEY environment variable is required");
    }
  }

  /**
   * Initialize a transaction
   */
  async initializeTransaction(data) {
    try {
      // Validate required fields
      if (!data.email || !data.amount) {
        throw new Error("Email and amount are required");
      }

      // Ensure amount is in kobo (smallest currency unit)
      const transactionData = {
        ...data,
        amount: Math.round(data.amount * 100), // Convert to kobo
        currency: data.currency || "NGN",
      };

      console.log("Initializing Paystack transaction:", {
        email: transactionData.email,
        amount: transactionData.amount,
        reference: transactionData.reference,
      });

      const response = await axios.post(
        `${this.API_URL}/transaction/initialize`,
        transactionData,
        {
          headers: {
            Authorization: `Bearer ${this.API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: this.timeout,
        }
      );

      console.log(
        "Paystack initialization successful:",
        response.data.data.reference
      );
      return response.data;
    } catch (error) {
      console.error("Paystack initialization error:", error);
      this.handlePaystackError(error);
    }
  }

  /**
   * Verify a transaction
   */
  async verifyTransaction(reference) {
    try {
      if (!reference) {
        throw new Error("Transaction reference is required");
      }

      console.log(`Verifying Paystack transaction: ${reference}`);

      const response = await axios.get(
        `${this.API_URL}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: this.timeout,
        }
      );

      console.log(`Paystack verification result: ${response.data.data.status}`);
      return response.data;
    } catch (error) {
      console.error("Paystack verification error:", error);
      this.handlePaystackError(error);
    }
  }

  /**
   * List all transactions
   */
  async listTransactions(params = {}) {
    try {
      const queryParams = new URLSearchParams();

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });

      const response = await axios.get(
        `${this.API_URL}/transaction?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${this.API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: this.timeout,
        }
      );

      return response.data;
    } catch (error) {
      console.error("Paystack list transactions error:", error);
      this.handlePaystackError(error);
    }
  }

  /**
   * Create a customer
   */
  async createCustomer(data) {
    try {
      const response = await axios.post(`${this.API_URL}/customer`, data, {
        headers: {
          Authorization: `Bearer ${this.API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
      });

      return response.data;
    } catch (error) {
      console.error("Paystack create customer error:", error);
      this.handlePaystackError(error);
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhook(payload, signature) {
    const hash = crypto
      .createHmac("sha512", this.API_KEY)
      .update(payload)
      .digest("hex");

    return hash === signature;
  }

  /**
   * Handle Paystack API errors
   */
  handlePaystackError(error) {
    if (error.response) {
      // Paystack API returned an error response
      const { status, data } = error.response;
      const message = data?.message || "Paystack API error";

      console.error(`Paystack API Error [${status}]:`, message);

      switch (status) {
        case 400:
          throw new Error(`Bad Request: ${message}`);
        case 401:
          throw new Error("Invalid Paystack API key");
        case 404:
          throw new Error("Transaction not found");
        case 500:
          throw new Error("Paystack server error. Please try again later.");
        default:
          throw new Error(`Paystack error: ${message}`);
      }
    } else if (error.code === "ECONNABORTED") {
      throw new Error("Request timeout. Please try again.");
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      throw new Error("Network error. Please check your connection.");
    } else {
      throw new Error(error.message || "Unknown Paystack error");
    }
  }

  /**
   * Generate a unique transaction reference
   */
  generateReference(prefix = "TXN") {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * Convert amount from naira to kobo
   */
  toKobo(amount) {
    return Math.round(amount * 100);
  }

  /**
   * Convert amount from kobo to naira
   */
  fromKobo(amount) {
    return amount / 100;
  }
}

// Create singleton instance
const paystackService = new PaystackService();

module.exports = paystackService;
