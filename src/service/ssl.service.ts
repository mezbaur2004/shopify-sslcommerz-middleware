import axios from "axios";
import { envVars } from "../config/envVariable.config";

// switch to live URL for production: https://securepay.sslcommerz.com
let SSL_BASE;
    if(envVars.SSL_ENV==="securepay"){
        SSL_BASE="https://securepay.sslcommerz.com;"
    }else{
        SSL_BASE="https://sandbox.sslcommerz.com";
    }
const sslClient = axios.create({
    baseURL: SSL_BASE,
    timeout: 15000
});

// ─────────────────────────────────────────────
// 1. CREATE SSL SESSION
// ─────────────────────────────────────────────

export const createSSLSession = async (order: {
    amount: number;
    currency: string;
    transaction_id: string;
    customer_name: string;
    customer_email: string;
    customer_phone?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    postcode?: string | null;
}) => {
    if (!order?.transaction_id || !order?.amount) {
        throw new Error("Invalid order data for SSL session");
    }

    const payload: Record<string, any> = {
        store_id: envVars.SSL_STORE_ID,
        store_passwd: envVars.SSL_STORE_PASS,

        total_amount: order.amount.toFixed(2), // amount is already in BDT (e.g. 1500.00)
        currency: order.currency || "BDT",
        tran_id: order.transaction_id,

        value_a:"JOLLY_PHONICS_BANGLADESH", // Hardcoded identifier for this specific app
        value_b: order.transaction_id,      // internal lookup ID here
        value_c: "PHYSICAL_BOOKS",          // Category for the accountant
        value_d: order.customer_email || "noemail@example.com",


        success_url: `${envVars.BASE_URL}/api/v1/payment/success`,
        fail_url: `${envVars.BASE_URL}/api/v1/payment/fail`,
        cancel_url: `${envVars.BASE_URL}/api/v1/payment/fail`,
        ipn_url: `${envVars.BASE_URL}/api/v1/payment/ipn`,

        cus_name: order.customer_name || "Customer",
        cus_email: order.customer_email || "noemail@example.com",
        cus_phone: order.customer_phone || "01300000000",
        cus_add1: order.address || "Bangladesh",
        cus_city: order.city || "Dhaka",
        cus_country: order.country || "Bangladesh",
        cus_postcode: order.postcode || "1209",

        shipping_method: "NO",
        num_of_item: 1,
        weight_of_items: "0.00",

        emi_option: 0, // Disable EMI by default
        product_name: "Educational Books & Training",
        product_category: "JP_books/training",
        product_profile: "general",

    };

    try {
        const params = new URLSearchParams();
        Object.entries(payload).forEach(([key, val]) => {
            if (val !== undefined && val !== null) params.append(key, String(val));
        });

        const res = await sslClient.post("/gwprocess/v4/api.php", params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        if (!res.data) throw new Error("Empty SSL response");

        if (res.data.status !== "SUCCESS") {
            console.error("SSL INIT FAILED:", res.data);
            throw new Error(res.data.failedreason || "SSL session init failed");
        }

        return res.data; // contains GatewayPageURL
    } catch (err: any) {
        console.error("SSL CREATE ERROR:", err.response?.data || err.message);
        throw new Error("Failed to create SSL session");
    }
};

// ─────────────────────────────────────────────
// 2. VALIDATE PAYMENT — called during IPN
//    expectedAmount: the amount stored in PaymentSession (BDT float)
// ─────────────────────────────────────────────

export const validateSSLPayment = async (
    data: any,
    expectedAmount: number,
    expectedTransactionId: string,
): Promise<boolean> => {
    if (!data?.val_id) {
        console.error("SSL VALIDATE: missing val_id");
        return false;
    }

    try {
        const res = await sslClient.get("/validator/api/validationserverAPI.php", {
            params: {
                val_id: data.val_id,
                store_id: envVars.SSL_STORE_ID,
                store_passwd: envVars.SSL_STORE_PASS,
                v: 1,
                format: "json"
            },
            timeout: 20000
        });

        const v = res.data;

        if (!v || (v.status !== "VALID" && v.status !== "VALIDATED")) {
            console.error("SSL VALIDATE: invalid status →", v?.status);
            return false;
        }

        const sslAmount = Number(v.amount);

        // Allow ±1 paisa tolerance for floating-point edge cases
        if (!Number.isFinite(sslAmount) || Math.abs(sslAmount - expectedAmount) > 0.01) {
            console.error("SSL VALIDATE: amount mismatch →", { sslAmount, expectedAmount });
            return false;
        }

        if (!v.tran_id || !v.bank_tran_id) {
            console.error("SSL VALIDATE: missing tran_id / bank_tran_id");
            return false;
        }

        if (v.tran_id !== expectedTransactionId) {
            console.error("SSL VALIDATE: tran_id mismatch →", {
                sslTranId: v.tran_id,
                expectedTransactionId
            });
            return false;
        }


        return true;
    } catch (err: any) {
        console.error("SSL VALIDATION ERROR:", err.response?.data || err.message);
        return false;
    }
};