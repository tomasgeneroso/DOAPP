import { jest, describe, it, expect, afterEach } from "@jest/globals";
import crypto from "crypto";

// ESM-correct module mocking (Jest can't hoist jest.mock in ESM — use unstable_mockModule).
jest.unstable_mockModule("../../server/config/env.js", () => ({
  config: {
    astropayEnabled: true,
    astropayApiKey: "test-api-key",
    astropaySecretKey: "test-secret",
    astropayBaseUrl: "https://sandbox.astropay.com",
  },
}));

const { default: astropayService } = await import("../../server/services/astropay.js");
const { config } = await import("../../server/config/env.js");

describe("AstroPay Service", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
    (config as any).astropayEnabled = true;
    (config as any).astropaySecretKey = "test-secret";
  });

  describe("isAvailable", () => {
    it("returns true when enabled and credentials are present", () => {
      expect(astropayService.isAvailable()).toBe(true);
    });

    it("returns false when the secret key is missing", () => {
      (config as any).astropaySecretKey = "";
      expect(astropayService.isAvailable()).toBe(false);
    });
  });

  describe("verifyWebhookSignature", () => {
    it("accepts a correctly HMAC-SHA256 signed body", () => {
      const body = JSON.stringify({ deposit_id: "dep_1", status: "APPROVED" });
      const signature = crypto.createHmac("sha256", "test-secret").update(body).digest("hex");
      expect(astropayService.verifyWebhookSignature(body, signature)).toBe(true);
    });

    it("rejects a tampered body", () => {
      const body = JSON.stringify({ deposit_id: "dep_1", status: "APPROVED" });
      const signature = crypto.createHmac("sha256", "test-secret").update(body).digest("hex");
      const tampered = JSON.stringify({ deposit_id: "dep_1", status: "REJECTED" });
      expect(astropayService.verifyWebhookSignature(tampered, signature)).toBe(false);
    });

    it("rejects a missing signature", () => {
      expect(astropayService.verifyWebhookSignature("{}", undefined)).toBe(false);
    });
  });

  describe("createPayment", () => {
    it("throws when AstroPay is not configured", async () => {
      (config as any).astropayEnabled = false;
      await expect(
        astropayService.createPayment({ amount: 100, currency: "ARS", description: "x" })
      ).rejects.toThrow(/no está configurado/i);
    });

    it("returns a checkout URL on success", async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ deposit_id: "dep_42", url: "https://pay.astropay.com/dep_42" }),
      })) as any;

      const result = await astropayService.createPayment({
        amount: 1500,
        currency: "ARS",
        description: "Publicación: Test",
        customerEmail: "user@test.com",
      });

      expect(result.provider).toBe("astropay");
      expect(result.checkoutUrl).toBe("https://pay.astropay.com/dep_42");
      expect(result.providerPaymentId).toBe("dep_42");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("throws when AstroPay returns a non-OK response", async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ message: "Bad request" }),
      })) as any;

      await expect(
        astropayService.createPayment({ amount: 100, currency: "ARS", description: "x" })
      ).rejects.toThrow(/Bad request/);
    });

    it("throws when no checkout URL is returned", async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ deposit_id: "dep_99" }),
      })) as any;

      await expect(
        astropayService.createPayment({ amount: 100, currency: "ARS", description: "x" })
      ).rejects.toThrow(/URL de checkout/i);
    });
  });
});
