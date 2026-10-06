import { beforeEach, describe, expect, it, vi } from "vitest";

// validateSSLPayment calls SSLCommerz through a module-level axios instance.
// Replace axios.create so that instance's get() is a mock we control.
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("axios", () => ({
    default: {
        create: () => ({ get: getMock, post: vi.fn() }),
    },
}));

import { validateSSLPayment } from "../src/service/ssl.service";

const EXPECTED_AMOUNT = 1500;
const EXPECTED_TRAN_ID = "TXN-123";

/** A validation-API response for a payment that should pass every check. */
const validResponse = (overrides: Record<string, unknown> = {}) => ({
    data: {
        status: "VALID",
        amount: "1500.00",
        tran_id: EXPECTED_TRAN_ID,
        bank_tran_id: "BANK-987",
        ...overrides,
    },
});

const validate = () =>
    validateSSLPayment({ val_id: "VAL-1" }, EXPECTED_AMOUNT, EXPECTED_TRAN_ID);

describe("validateSSLPayment", () => {
    beforeEach(() => {
        getMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("accepts a VALID payment whose amount and transaction ID match", async () => {
        getMock.mockResolvedValue(validResponse());
        await expect(validate()).resolves.toBe(true);
    });

    it("accepts the VALIDATED status SSLCommerz returns for an already-validated payment", async () => {
        getMock.mockResolvedValue(validResponse({ status: "VALIDATED" }));
        await expect(validate()).resolves.toBe(true);
    });

    it("sends the val_id and store credentials to the validation API", async () => {
        getMock.mockResolvedValue(validResponse());
        await validate();

        expect(getMock).toHaveBeenCalledTimes(1);
        const [path, config] = getMock.mock.calls[0]!;
        expect(path).toBe("/validator/api/validationserverAPI.php");
        expect(config.params).toMatchObject({
            val_id: "VAL-1",
            store_id: "test-store",
            store_passwd: "test-pass",
            format: "json",
        });
    });

    it("rejects without calling the API when val_id is missing", async () => {
        await expect(
            validateSSLPayment({}, EXPECTED_AMOUNT, EXPECTED_TRAN_ID),
        ).resolves.toBe(false);
        expect(getMock).not.toHaveBeenCalled();
    });

    it.each(["FAILED", "CANCELLED", "INVALID_TRANSACTION", undefined])(
        "rejects status %s",
        async (status) => {
            getMock.mockResolvedValue(validResponse({ status }));
            await expect(validate()).resolves.toBe(false);
        },
    );

    it("accepts an amount within the ±0.01 tolerance", async () => {
        getMock.mockResolvedValue(validResponse({ amount: "1500.01" }));
        await expect(validate()).resolves.toBe(true);
    });

    it.each(["1499.98", "1500.02", "150.00", "15000.00"])(
        "rejects amount %s against an expected 1500",
        async (amount) => {
            getMock.mockResolvedValue(validResponse({ amount }));
            await expect(validate()).resolves.toBe(false);
        },
    );

    it.each([undefined, "", "not-a-number"])("rejects a non-numeric amount (%s)", async (amount) => {
        getMock.mockResolvedValue(validResponse({ amount }));
        await expect(validate()).resolves.toBe(false);
    });

    it("rejects a transaction ID that belongs to another session", async () => {
        getMock.mockResolvedValue(validResponse({ tran_id: "TXN-OTHER" }));
        await expect(validate()).resolves.toBe(false);
    });

    it("rejects a response without a bank transaction ID", async () => {
        getMock.mockResolvedValue(validResponse({ bank_tran_id: undefined }));
        await expect(validate()).resolves.toBe(false);
    });

    it("rejects an empty response body", async () => {
        getMock.mockResolvedValue({ data: null });
        await expect(validate()).resolves.toBe(false);
    });

    it("rejects, rather than throws, when the validation API is unreachable", async () => {
        getMock.mockRejectedValue(new Error("connect ETIMEDOUT"));
        await expect(validate()).resolves.toBe(false);
    });
});
