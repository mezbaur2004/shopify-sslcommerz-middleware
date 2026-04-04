import axios from "axios";
import { envVars } from "../config/envVariable.config";

const SHOP = envVars.SHOPIFY_STORE;
const TOKEN = envVars.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = envVars.SHOPIFY_API_VERSION || "2026-01";

export const shopifyClient = axios.create({
    baseURL: `https://${SHOP}/admin/api/${API_VERSION}`,
    headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json"
    },
    timeout: 15000
});

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface LineItem {
    variant_id: number;
    quantity: number;
}

export interface CheckoutCustomer {
    name: string;
    email: string;
    phone?: string | null;
}

export interface CheckoutAddress {
    address1: string;
    address2?: string | null;
    city: string;
    province?: string | null;
    country: string;
    zip?: string | null;
}

// ─────────────────────────────────────────────
// 1. CREATE DRAFT ORDER
// ─────────────────────────────────────────────

export const createDraftOrder = async (params: {
    lineItems: LineItem[];
    customer: CheckoutCustomer;
    shippingAddress: CheckoutAddress;
    shippingLine?: {
        title: string;
        price: string;
    };
    note?: string | null;
}) => {
    const { lineItems, customer, shippingAddress, shippingLine, note } = params;

    const nameParts = customer.name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || ".";

    const addressPayload = {
        first_name: firstName,
        last_name: lastName,
        phone: customer.phone || null,
        address1: shippingAddress.address1,
        address2: shippingAddress.address2 || null,
        city: shippingAddress.city,
        province: shippingAddress.province || null,
        country: shippingAddress.country,
        zip: shippingAddress.zip || null
    };

    try {
        const res = await shopifyClient.post("/draft_orders.json", {
            draft_order: {
                line_items: lineItems.map((item) => ({
                    variant_id: item.variant_id,
                    quantity: item.quantity
                })),
                customer: {
                    first_name: firstName,
                    last_name: lastName,
                    email: customer.email,
                    phone: customer.phone || null
                },
                shipping_address: addressPayload,
                billing_address: addressPayload,

                ...(shippingLine && {
                    shipping_line: {
                        title: shippingLine.title,
                        price: Number(shippingLine.price).toFixed(2)
                    }
                }),

                note: note || null,
                use_customer_default_address: false
            }
        });

        return res.data.draft_order; // has .id, .total_price, .currency, .order_id etc.
    } catch (err: any) {
        console.error("CREATE DRAFT ORDER ERROR:", err.response?.data || err.message);
        throw new Error("Failed to create draft order");
    }
};

// ─────────────────────────────────────────────
// 2. GET DRAFT ORDER
// ─────────────────────────────────────────────

export const getDraftOrder = async (draftOrderId: string) => {
    try {
        const res = await shopifyClient.get(`/draft_orders/${draftOrderId}.json`);
        return res.data.draft_order;
    } catch (err: any) {
        console.error("GET DRAFT ORDER ERROR:", err.response?.data || err.message);
        throw new Error("Failed to fetch draft order");
    }
};

// ─────────────────────────────────────────────
// 3. COMPLETE DRAFT ORDER → becomes real paid Order
// ─────────────────────────────────────────────

export const completeDraftOrder = async (draftOrderId: string) => {
    try {
        // payment_pending: false → marks the resulting order as fully paid
        const res = await shopifyClient.put(
            `/draft_orders/${draftOrderId}/complete.json`,
            { payment_pending: false }
        );

        // res.data.draft_order.order_id is the newly created Shopify order ID
        return res.data.draft_order;
    } catch (err: any) {
        console.error("COMPLETE DRAFT ORDER ERROR:", err.response?.data || err.message);
        throw new Error("Failed to complete draft order");
    }
};

// ─────────────────────────────────────────────
// 4. DELETE DRAFT ORDER (on fail / timeout)
// ─────────────────────────────────────────────

export const deleteDraftOrder = async (draftOrderId: string): Promise<boolean> => {
    try {
        await shopifyClient.delete(`/draft_orders/${draftOrderId}.json`);
        return true;
    } catch (err: any) {
        if (err.response?.status === 404) return true; // already gone — that's fine
        console.error("DELETE DRAFT ORDER ERROR:", err.response?.data || err.message);
        throw new Error("Failed to delete draft order");
    }
};

// ─────────────────────────────────────────────
// 5. GET ORDER (after completion)
// ─────────────────────────────────────────────

export const getOrder = async (orderId: string) => {
    if (!/^\d+$/.test(orderId)) throw new Error("Invalid orderId format");

    try {
        const res = await shopifyClient.get(`/orders/${orderId}.json`);
        return res.data.order;
    } catch (err: any) {
        console.error("GET ORDER ERROR:", err.response?.data || err.message);
        throw new Error("Failed to fetch order");
    }
};