import { afterEach, describe, expect, it, vi } from "vitest";

// Capture the config ssl.service passes to axios.create.
const { createMock } = vi.hoisted(() => ({
    createMock: vi.fn(() => ({ get: vi.fn(), post: vi.fn() })),
}));

vi.mock("axios", () => ({ default: { create: createMock } }));

const loadWithSslEnv = async (sslEnv: string) => {
    process.env.SSL_ENV = sslEnv;
    vi.resetModules();
    createMock.mockClear();
    await import("../src/service/ssl.service");
    const config = (createMock.mock.calls as unknown as [{ baseURL: string }][])[0]![0];
    return new URL(config.baseURL);
};

describe("SSLCommerz base URL", () => {
    afterEach(() => {
        process.env.SSL_ENV = "sandbox";
    });

    // Regression: the live URL once carried a stray ";" inside the string,
    // which makes every live request fail DNS lookup (ENOTFOUND).
    it("points at the live gateway when SSL_ENV is securepay", async () => {
        const url = await loadWithSslEnv("securepay");
        expect(url.protocol).toBe("https:");
        expect(url.hostname).toBe("securepay.sslcommerz.com");
    });

    it("points at the sandbox otherwise", async () => {
        const url = await loadWithSslEnv("sandbox");
        expect(url.hostname).toBe("sandbox.sslcommerz.com");
    });
});
