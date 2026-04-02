import axios from "axios";
import { envVars } from "../config/envVariable.config";

const SSL_BASE = "https://sandbox.sslcommerz.com";

const sslClient = axios.create({
    baseURL: SSL_BASE,
    timeout: 20000 // increased from 10s (critical for production)
});

//
// 1. CREATE SSL SESSION
//
export const createSSLSession = async (order: any) => {
    if (!order?.transaction_id || !order?.amount) {
        throw new Error("Invalid order data");
    }

    const payload = {
        store_id: envVars.SSL_STORE_ID,
        store_passwd: envVars.SSL_STORE_PASS,

        total_amount: (Number(order.amount)/100).toFixed(2),
        currency: order.currency || "BDT",
        tran_id: order.transaction_id,

        success_url: `${envVars.BASE_URL}/api/v1/payment/success`,
        fail_url: `${envVars.BASE_URL}/api/v1/payment/fail`,
        cancel_url: `${envVars.BASE_URL}/api/v1/payment/fail`,
        ipn_url: `${envVars.BASE_URL}/api/v1/payment/ipn`,

        cus_name: order.customer_name || "Customer",
        cus_email: order.customer_email || "noemail@example.com",
        cus_phone: order.customer_phone || "0130000000",
        cus_add1: "Bangladesh",
        cus_city: "Dhaka",
        cus_country: "Bangladesh",

        shipping_method: "NO",
        product_name: "Cart Order",
        product_category: "general",
        product_profile: "general",
        value_a: String(order.transaction_id)
    };

    try {
        const params = new URLSearchParams();

        Object.entries(payload).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                params.append(key, String(value));
            }
        });

        const res = await sslClient.post(
            "/gwprocess/v4/api.php",
            params,
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        // IMPORTANT: don't assume only "SUCCESS"
        if (!res.data) {
            console.error("EMPTY SSL RESPONSE");
            throw new Error("Empty SSL response");
        }

        if (res.data.status !== "SUCCESS") {
            console.error("SSL INIT FAILED:", res.data);
            throw new Error(res.data.failedreason || "SSL session failed");
        }

        return res.data;

    } catch (err: any) {
        console.error("SSL CREATE ERROR:", err.response?.data || err.message);
        throw new Error("Failed to create SSL session");
    }
};

//
// 2. VALIDATE PAYMENT (IPN)
//
export const validateSSLPayment = async (data: any, order: any) => {
    if (!data?.val_id) {
        throw new Error("Missing val_id");
    }

    try {
        const res = await sslClient.get(
            "/validator/api/validationserverAPI.php",
            {
                params: {
                    val_id: data.val_id,
                    store_id: envVars.SSL_STORE_ID,
                    store_passwd: envVars.SSL_STORE_PASS,
                    v: 1,
                    format: "json"
                },
                timeout: 20000
            }
        );

        const v = res.data;

        if (!v || v.status !== "VALID") {
            return false;
        }

        const sslAmount = Number(v.amount);
        const orderAmount = Number(order.total_price);

        if (
            v.currency !== "BDT" ||
            !Number.isFinite(sslAmount) ||
            sslAmount !== orderAmount
        ) {
            console.error("AMOUNT/CURRENCY MISMATCH:", v);
            return false;
        }

        if (!v.tran_id || !v.bank_tran_id) {
            console.error("MISSING TRANSACTION DATA:", v);
            return false;
        }

        return true;

    } catch (err: any) {
        console.error("SSL VALIDATION ERROR:", err.response?.data || err.message);
        return false;
    }
};