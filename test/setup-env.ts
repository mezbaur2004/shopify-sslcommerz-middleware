// Every module reads envVariable.config at import time, which throws if a
// required variable is missing. Tests never reach SSLCommerz, Shopify,
// MongoDB or Brevo, so placeholder values are enough.
const testEnv: Record<string, string> = {
    PORT: "8080",
    NODE_ENV: "test",
    DB_URL: "mongodb://127.0.0.1:27017/test",
    ORIGINS: "https://example.test",
    SHOPIFY_STORE: "example.myshopify.com",
    SHOPIFY_ADMIN_TOKEN: "test-token",
    SHOPIFY_API_VERSION: "2026-01",
    SSL_STORE_ID: "test-store",
    SSL_STORE_PASS: "test-pass",
    BASE_URL: "https://backend.example.test",
    SSL_IPS: "103.26.139.87,103.132.153.81",
    SSL_ENV: "sandbox",
    BREVO_API_KEY: "test-key",
    BREVO_VERIFIED_EMAIL: "sender@example.test",
};

for (const [key, value] of Object.entries(testEnv)) {
    process.env[key] = value;
}
