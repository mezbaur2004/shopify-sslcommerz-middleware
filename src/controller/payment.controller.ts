import { Request, Response } from "express";
import { createSSLSession, validateSSLPayment } from "../service/ssl.service";
import {
    createDraftOrder,
    completeDraftOrder,
    deleteDraftOrder
} from "../service/shopify.service";
import { envVars } from "../config/envVariable.config";
import PaymentSessionModel from "../model/payment-session.model";
import PaymentModel from "../model/payments.model";
import PaymentEventModel from "../model/payment-events.model";

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const logEvent = async (
    referenceId: string,
    referenceType: "draft_order" | "order",
    eventType: string,
    payload: object = {}
) => {
    try {
        await PaymentEventModel.create({
            reference_id: referenceId,
            reference_type: referenceType,
            event_type: eventType,
            payload
        });
    } catch (e: any) {
        console.error("EVENT LOG ERROR:", e.message);
    }
};

// ─────────────────────────────────────────────
// 1. INIT PAYMENT
//    - Receives full checkout form data
//    - Creates a Shopify Draft Order
//    - Stores PaymentSession
//    - Returns redirect URL to SSL gateway
// ─────────────────────────────────────────────

export const initPayment = async (req: Request, res: Response) => {
    try {
        const { lineItems, customer, shippingAddress, shippingMethod, note } = req.body;

        // ── Validation ──────────────────────────────────────────────────
        if (!Array.isArray(lineItems) || lineItems.length === 0) {
            return res.status(400).json({ message: "lineItems[] is required" });
        }

        for (const item of lineItems) {
            if (!item.variant_id || !item.quantity || item.quantity < 1) {
                return res.status(400).json({
                    message: "Each lineItem must have variant_id and quantity ≥ 1"
                });
            }
        }

        if (!customer?.name?.trim() || !customer?.email?.trim()) {
            return res
                .status(400)
                .json({ message: "customer.name and customer.email are required" });
        }

        if (
            !shippingAddress?.address1?.trim() ||
            !shippingAddress?.city?.trim() ||
            !shippingAddress?.country?.trim()
        ) {
            return res.status(400).json({
                message: "shippingAddress.address1, .city, and .country are required"
            });
        }

        let shippingLine: { title: string; price: string };

        if (shippingMethod === "free") {
            shippingLine = {
                title: "Training Program",
                price: "0"
            };
        } else if (shippingMethod === "inside") {
            shippingLine = {
                title: "Inside Dhaka",
                price: "60"
            };
        } else if (shippingMethod === "outside") {
            shippingLine = {
                title: "Outside Dhaka",
                price: "130"
            };
        } else {
            return res.status(400).json({ message: "Invalid shipping method" });
        }

        // ── Create Shopify Draft Order ───────────────────────────────────
        const draftOrder = await createDraftOrder({
            lineItems,
            customer,
            shippingAddress,
            shippingLine,
            note: note || null
        });

        const draftOrderId = String(draftOrder.id);
        const amount = parseFloat(draftOrder.total_price);
        const currency: string = draftOrder.currency || "BDT";

        if (isNaN(amount) || amount <= 0) {
            await deleteDraftOrder(draftOrderId).catch(console.error);
            return res
                .status(400)
                .json({ message: "Invalid order total from Shopify" });
        }

        // ── Create PaymentSession ────────────────────────────────────────
        const transactionId = `txn_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 8)}`;
        const cartToken = `cart_${draftOrderId}_${Date.now()}`;
        const expiryTime = new Date(Date.now() + SESSION_TTL_MS);

        await PaymentSessionModel.create({
            cartToken,
            draftOrderId,
            transactionId,
            status: "pending",
            amount,
            currency,
            expiryTime,
            customer: {
                name: customer.name.trim(),
                email: customer.email.trim().toLowerCase(),
                phone: customer.phone ?? null
            },
            shippingAddress: {
                address1: shippingAddress.address1,
                address2: shippingAddress.address2 ?? null,
                city: shippingAddress.city,
                province: shippingAddress.province ?? null,
                country: shippingAddress.country,
                zip: shippingAddress.zip ?? null
            },
            meta: {
                ip: req.ip ?? null,
                userAgent: req.headers["user-agent"] ?? null
            }
        });

        await logEvent(draftOrderId, "draft_order", "created", {
            draftOrderId,
            transactionId,
            amount,
            currency,
            expiresAt: expiryTime
        });

        return res.status(201).json({
            ok: true,
            draftOrderId,
            transactionId,
            amount,
            currency,
            expiresAt: expiryTime,
            redirectUrl: `${envVars.BASE_URL}/api/v1/payment/redirect/${transactionId}`
        });
    } catch (err: any) {
        console.error("INIT PAYMENT ERROR:", err.message);
        return res.status(500).json({ message: "Payment init failed" });
    }
};

// ─────────────────────────────────────────────
// 2. REDIRECT TO SSL GATEWAY
//    - Browser hits this URL
//    - Validates session is still alive
//    - Creates SSL session → redirects to GatewayPageURL
// ─────────────────────────────────────────────

export const redirectToSSL = async (req: Request, res: Response) => {
    try {
        const { transactionId } = req.params;

        const session = await PaymentSessionModel.findOne({ transactionId });

        if (!session) {
            return res.status(404).send("Payment session not found.");
        }

        // Already successfully paid
        if (session.status === "success") {
            return res.redirect(
                `https://${envVars.SHOPIFY_STORE}/account/orders`
            );
        }

        // Expired or failed
        if (session.status !== "pending") {
            return res
                .status(410)
                .send(
                    "This payment session has expired or been cancelled. Please place a new order."
                );
        }

        // Check TTL
        if (new Date() > session.expiryTime) {
            await PaymentSessionModel.updateOne(
                { transactionId },
                { $set: { status: "expired" } }
            );
            await deleteDraftOrder(session.draftOrderId).catch(console.error);
            await logEvent(session.draftOrderId, "draft_order", "expired", {
                reason: "TTL exceeded at redirect"
            });
            return res
                .status(410)
                .send(
                    "Your 15-minute payment window has expired. Please start a new checkout."
                );
        }

        // Guard subdocuments before accessing
        if (!session.customer || !session.shippingAddress) {
            return res.status(500).send("Session data is corrupt.");
        }

        // Create SSL gateway session
        const sslSession = await createSSLSession({
            amount: session.amount,
            currency: session.currency,
            transaction_id: session.transactionId,
            customer_name: session.customer.name,
            customer_email: session.customer.email,
            customer_phone: session.customer.phone ?? null,
            address: session.shippingAddress.address1 ?? null,
            city: session.shippingAddress.city ?? null,
            country: session.shippingAddress.country ?? null
        });

        if (!sslSession?.GatewayPageURL) {
            return res
                .status(500)
                .send("Failed to open payment gateway. Please try again.");
        }

        await logEvent(session.draftOrderId, "draft_order", "redirected", {
            transactionId,
            amount: session.amount
        });

        return res.redirect(sslSession.GatewayPageURL);
    } catch (err: any) {
        console.error("SSL REDIRECT ERROR:", err.message);
        return res.status(500).send("Payment redirect failed.");
    }
};

// ─────────────────────────────────────────────
// 3. IPN — SSLCommerz server-to-server notification
//    - Validates payment authenticity
//    - Completes draft order → creates real Shopify order
//    - Creates Payment record
// ─────────────────────────────────────────────

export const paymentIPN = async (req: Request, res: Response) => {
    try {
        const data = req.body;

        if (!data || typeof data !== "object") {
            return res.status(400).send("Invalid IPN payload");
        }

        // value_a holds our transactionId (set during SSL session creation)
        const transactionId: string = data.value_a;
        if (!transactionId) {
            return res.status(400).send("Missing transactionId in IPN");
        }

        const session = await PaymentSessionModel.findOne({ transactionId });
        if (!session) {
            return res.status(404).send("Session not found");
        }

        // ── Idempotency ──────────────────────────────────────────────────
        if (session.status === "success") {
            return res.send("OK"); // already processed
        }

        await logEvent(session.draftOrderId, "draft_order", "ipn_received", {
            status: data.status,
            tran_id: data.tran_id,
            amount: data.amount
        });

        // ── Check TTL ────────────────────────────────────────────────────
        if (new Date() > session.expiryTime) {
            await PaymentSessionModel.updateOne(
                { transactionId },
                { $set: { status: "expired" } }
            );
            await deleteDraftOrder(session.draftOrderId).catch(console.error);
            await logEvent(session.draftOrderId, "draft_order", "expired", {
                reason: "TTL exceeded at IPN"
            });
            return res.status(410).send("Session expired");
        }

        // ── Validate IPN status ──────────────────────────────────────────
        if (data.status !== "VALID" && data.status !== "VALIDATED") {
            await PaymentSessionModel.updateOne(
                { transactionId },
                { $set: { status: "failed" } }
            );
            await deleteDraftOrder(session.draftOrderId).catch(console.error);
            await logEvent(session.draftOrderId, "draft_order", "failed", {
                reason: `IPN status was '${data.status}', not VALID`
            });
            return res.status(400).send("Invalid payment");
        }

        // ── Server-side SSL validation (val_id check) ────────────────────
        const isValid = await validateSSLPayment(data, session.amount);
        if (!isValid) {
            await PaymentSessionModel.updateOne(
                { transactionId },
                { $set: { status: "failed" } }
            );
            await deleteDraftOrder(session.draftOrderId).catch(console.error);
            await logEvent(session.draftOrderId, "draft_order", "failed", {
                reason: "SSL server-side validation failed (amount mismatch or invalid val_id)"
            });
            return res.status(400).send("Validation failed");
        }

        // ── Complete Draft Order → creates real Shopify Order ────────────
        const completedDraft = await completeDraftOrder(session.draftOrderId);
        const shopifyOrderId = String(completedDraft.order_id);

        // ── Guard subdocuments before accessing ──────────────────────────
        if (!session.customer || !session.shippingAddress) {
            return res.status(500).send("Session data is corrupt.");
        }

        // ── Save Payment record ──────────────────────────────────────────
        await PaymentModel.create({
            shopify_order_id: shopifyOrderId,
            draft_order_id: session.draftOrderId,
            cart_token: session.cartToken,
            status: "paid",
            amount: session.amount,
            currency: session.currency,
            gateway: "sslcommerz",
            transaction_id: data.tran_id || transactionId,
            customer_email: session.customer.email,
            ipn_verified: true,
            paid_at: new Date()
        });

        // ── Update session status ────────────────────────────────────────
        await PaymentSessionModel.updateOne(
            { transactionId },
            { $set: { status: "success" } }
        );

        await logEvent(shopifyOrderId, "order", "completed", {
            draftOrderId: session.draftOrderId,
            shopifyOrderId,
            tran_id: data.tran_id,
            amount: session.amount
        });

        return res.send("OK");
    } catch (err: any) {
        console.error("IPN ERROR:", err.message);
        return res.status(500).send("Internal error");
    }
};

// ─────────────────────────────────────────────
// 4. SUCCESS — browser redirect from SSLCommerz
//    IPN already handled business logic.
//    This is purely a UX redirect for the user.
// ─────────────────────────────────────────────

export const paymentSuccess = async (req: Request, res: Response) => {
    try {
        const transactionId: string =
            req.body?.value_a ?? (req.query?.value_a as string);

        if (transactionId) {
            const session = await PaymentSessionModel.findOne({
                transactionId
            }).lean();

            if (session?.status === "success") {
                return res.redirect(
                    `https://${envVars.SHOPIFY_STORE}/account/orders`
                );
            }

            // IPN may not have fired yet — redirect anyway;
            // the order will appear once IPN completes
        }

        return res.redirect(
            `https://${envVars.SHOPIFY_STORE}/account/orders`
        );
    } catch {
        return res.redirect(
            `https://${envVars.SHOPIFY_STORE}/account/orders`
        );
    }
};

// ─────────────────────────────────────────────
// 5. FAIL — browser redirect from SSLCommerz on failure / cancel
//    Marks session failed & deletes draft order so stock is released.
// ─────────────────────────────────────────────

export const paymentFail = async (req: Request, res: Response) => {
    try {
        const transactionId: string =
            req.body?.value_a ?? (req.query?.value_a as string);

        if (transactionId) {
            const session = await PaymentSessionModel.findOne({ transactionId });

            if (session && session.status === "pending") {
                await PaymentSessionModel.updateOne(
                    { transactionId },
                    { $set: { status: "failed" } }
                );
                await deleteDraftOrder(session.draftOrderId).catch(console.error);
                await logEvent(
                    session.draftOrderId,
                    "draft_order",
                    "cancelled",
                    { reason: "User cancelled or payment failed at gateway" }
                );
            }
        }
    } catch (err: any) {
        console.error("FAIL HANDLER ERROR:", err.message);
    }

    // Send user back to cart so they can retry
    return res.redirect(`https://${envVars.SHOPIFY_STORE}/cart`);
};