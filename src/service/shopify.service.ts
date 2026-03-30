import axios from "axios";
import { envVars } from "../config/envVariable.config";

const SHOP = envVars.SHOPIFY_STORE;
const TOKEN = envVars.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = envVars.SHOPIFY_API_VERSION || "2025-01";

// shared axios config
const shopifyClient = axios.create({
    baseURL: `https://${SHOP}/admin/api/${API_VERSION}`,
    headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json"
    },
    timeout: 10000
});

// Get order
export const getOrder = async (orderId: string) => {
    if (!/^\d+$/.test(orderId)) {
        throw new Error("Invalid orderId format");
    }

    try {
        const res = await shopifyClient.get(`/orders/${orderId}.json`);
        return res.data.order;
    } catch (err: any) {
        console.error("GET ORDER ERROR:", err.response?.data || err.message);
        throw new Error("Failed to fetch order");
    }
};

// Mark order paid
export const markOrderPaid = async (orderId: string, data: any, order: any) => {
    if (!order) throw new Error("Order required for validation");

    const sslAmount = parseFloat(data.amount);
    const shopifyAmount = parseFloat(order.total_price);

    // 🔒 strict validation
    if (isNaN(sslAmount) || sslAmount !== shopifyAmount) {
        throw new Error("Amount mismatch");
    }

    if (order.financial_status === "paid") {
        return; // idempotent exit
    }

    try {
        // ✅ safer: create SALE transaction instead of capture
        await shopifyClient.post(`/orders/${orderId}/transactions.json`, {
            transaction: {
                kind: "capture", // better for external gateway
                status: "success",
                amount: sslAmount.toFixed(2),
                gateway: "sslcommerz",
                source: "external"
            }
        });

    } catch (err: any) {
        console.error("MARK PAID ERROR:", err.response?.data || err.message);
        throw new Error("Failed to mark order as paid");
    }
};