import axios from "axios";
import { envVars } from "../config/envVariable.config";

const SHOP = envVars.SHOPIFY_STORE;
const TOKEN = envVars.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = envVars.SHOPIFY_API_VERSION || "2026-01";

// shared axios config
export const shopifyClient = axios.create({
    baseURL: `https://${SHOP}/admin/api/${API_VERSION}`,
    headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json"
    },
    timeout: 10000
});


// =======================
// GET ORDER
// =======================
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


// =======================
// MARK ORDER AS PAID
// =======================
export const markOrderPaid = async (orderId: string, data: any, order: any) => {
    if (!order) throw new Error("Order required for validation");

    const sslAmount = parseFloat(data.amount);
    const shopifyAmount = parseFloat(order.total_price);

    // 🔒 strict validation
    if (isNaN(sslAmount) || sslAmount !== shopifyAmount) {
        throw new Error("Amount mismatch");
    }

    // idempotency check
    if (order.financial_status === "paid") {
        return;
    }

    try {
        await shopifyClient.post(`/orders/${orderId}/transactions.json`, {
            transaction: {
                kind: "capture",
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


// =======================
// ADJUST INVENTORY (MANUAL)
// =======================
export const adjustInventoryFromOrder = async (order: any) => {
    const LOCATION_ID = envVars.SHOPIFY_LOCATION_ID;

    if (!LOCATION_ID) {
        throw new Error("Missing SHOPIFY_LOCATION_ID");
    }

    try {
        for (const item of order.line_items) {

            // skip if no variant
            if (!item.variant_id) continue;

            // 1. get variant → inventory_item_id
            const variantRes = await shopifyClient.get(
                `/variants/${item.variant_id}.json`
            );

            const variant = variantRes.data.variant;

            // skip if inventory not tracked
            if (!variant.inventory_management) continue;

            const inventoryItemId = variant.inventory_item_id;

            // 2. deduct stock
            await shopifyClient.post(`/inventory_levels/adjust.json`, {
                location_id: LOCATION_ID,
                inventory_item_id: inventoryItemId,
                available_adjustment: -item.quantity
            });
        }

    } catch (err: any) {
        console.error("INVENTORY UPDATE ERROR:", err.response?.data || err.message);
        throw new Error("Failed to adjust inventory");
    }
};