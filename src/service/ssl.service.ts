import axios from "axios";
import {envVars} from "../config/envVariable.config";

const SSL_BASE = "https://securepay.sslcommerz.com";

// shared client
const sslClient = axios.create({
    baseURL: SSL_BASE,
    timeout: 10000
});

// Create SSL session
export const createSSLSession = async (order: any) => {
    if (!order?.id || !order?.total_price) {
        throw new Error("Invalid order data");
    }

    const payload = {
        store_id: envVars.SSL_STORE_ID,
        store_passwd: envVars.SSL_STORE_PASS,

        total_amount: parseFloat(order.total_price).toFixed(2),
        currency: "BDT",
        tran_id: `${order.id}_${Date.now()}`,

        success_url: `${envVars.BASE_URL}/api/payment/success`,
        fail_url: `${envVars.BASE_URL}/api/payment/fail`,
        cancel_url: `${envVars.BASE_URL}/api/payment/fail`,
        ipn_url: `${envVars.BASE_URL}/api/payment/ipn`,

        cus_name: order.customer?.first_name || "Customer",
        cus_email: order.email || "noemail@example.com",

        value_a: String(order.id) // always string
    };

    try {
        const res = await sslClient.post("/gwprocess/v4/api.php", payload);

        if (!res.data || res.data.status !== "SUCCESS") {
            console.error("SSL INIT FAILED:", res.data);
            throw new Error("SSL session creation failed");
        }

        return res.data;

    } catch (err: any) {
        console.error("SSL CREATE ERROR:", err.response?.data || err.message);
        throw new Error("Failed to create SSL session");
    }
};

// Validate payment (IPN)
export const validateSSLPayment = async (data: any, order: any) => {
    if (!data?.val_id) {
        throw new Error("Missing val_id");
    }

    const url = `/validator/api/validationserverAPI.php`;

    try {
        const res = await sslClient.get(url, {
            params: {
                val_id: data.val_id,
                store_id: envVars.SSL_STORE_ID,
                store_passwd: envVars.SSL_STORE_PASS,
                v: 1,
                format: "json"
            }
        });

        const validation = res.data;

        if (!validation || validation.status !== "VALID") {
            return false;
        }

        // 🔒 CRITICAL VALIDATIONS
        const sslAmount = parseFloat(validation.amount);
        const orderAmount = parseFloat(order.total_price);

        if (
            validation.currency !== "BDT" ||
            isNaN(sslAmount) ||
            sslAmount !== orderAmount
        ) {
            console.error("VALIDATION MISMATCH:", validation);
            return false;
        }

        // optional but recommended checks
        if (!validation.tran_id || !validation.bank_tran_id) {
            console.error("MISSING TRANSACTION DATA:", validation);
            return false;
        }

        return true;

    } catch (err: any) {
        console.error("SSL VALIDATION ERROR:", err.response?.data || err.message);
        return false;
    }
};