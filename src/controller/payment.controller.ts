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
import {sendEmail} from "../service/mailservice";

const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes

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
        const transactionId = `JP_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
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
                `https://${envVars.SHOPIFY_STORE}/pages/payment-success`
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
        console.log("[IPN] hit");
        console.log("[IPN] body:", req.body);

        const data = req.body;

        if (!data || typeof data !== "object") {
            console.log("[IPN] invalid payload");
            return res.status(400).send("Invalid IPN payload");
        }

        const transactionId: string = data.value_b;
        console.log("[IPN] transactionId:", transactionId);

        if (!transactionId) {
            console.log("[IPN] missing transactionId");
            return res.status(400).send("Missing transactionId in IPN");
        }

        const session = await PaymentSessionModel.findOne({ transactionId });
        console.log("[IPN] session found:", !!session);

        if (!session) {
            console.log("[IPN] session not found");
            return res.status(404).send("Session not found");
        }

        console.log("[IPN] session status:", session.status);
        console.log("[IPN] session emailSent:", session.emailSent);
        console.log("[IPN] session expiryTime:", session.expiryTime);

        if (session.status === "success") {
            console.log("[IPN] already processed, returning OK");
            return res.send("OK");
        }

        await logEvent(session.draftOrderId, "draft_order", "ipn_received", {
            status: data.status,
            tran_id: data.tran_id,
            amount: data.amount
        });

        console.log("[IPN] logged ipn_received event");

        if (new Date() > session.expiryTime) {
            console.log("[IPN] session expired, cleaning up draft order");

            await PaymentSessionModel.updateOne(
                { transactionId },
                { $set: { status: "expired" } }
            );

            await deleteDraftOrder(session.draftOrderId).catch((err) => {
                console.error("[IPN] deleteDraftOrder error on expiry:", err);
            });

            await logEvent(session.draftOrderId, "draft_order", "expired", {
                reason: "TTL exceeded at IPN"
            });

            console.log("[IPN] expired flow complete");
            return res.status(410).send("Session expired");
        }

        if (data.tran_id !== session.transactionId) {
            console.log("[IPN] tran_id mismatch", {
                received: data.tran_id,
                expected: session.transactionId
            });

            await logEvent(session.draftOrderId, "draft_order", "failed", {
                reason: "Incoming tran_id mismatch before validation",
                received: data.tran_id,
                expected: session.transactionId
            });

            return res.status(400).send("Invalid transaction mapping");
        }

        if (data.status !== "VALID" && data.status !== "VALIDATED") {
            console.log("[IPN] invalid gateway status:", data.status);

            await PaymentSessionModel.updateOne(
                { transactionId },
                { $set: { status: "failed" } }
            );

            await deleteDraftOrder(session.draftOrderId).catch((err) => {
                console.error("[IPN] deleteDraftOrder error on invalid status:", err);
            });

            await logEvent(session.draftOrderId, "draft_order", "failed", {
                reason: `IPN status was '${data.status}', not VALID`
            });

            return res.status(400).send("Invalid payment");
        }

        console.log("[IPN] running server-side SSL validation...");

        const isValid = await validateSSLPayment(
            data,
            session.amount,
            session.transactionId
        );

        console.log("[IPN] SSL validation result:", isValid);

        if (!isValid) {
            await PaymentSessionModel.updateOne(
                { transactionId },
                { $set: { status: "failed" } }
            );

            await deleteDraftOrder(session.draftOrderId).catch((err) => {
                console.error("[IPN] deleteDraftOrder error on validation failure:", err);
            });

            await logEvent(session.draftOrderId, "draft_order", "failed", {
                reason: "SSL server-side validation failed (amount mismatch or invalid val_id)"
            });

            return res.status(400).send("Validation failed");
        }

        if (!session.customer || !session.shippingAddress) {
            console.log("[IPN] session data corrupt");
            return res.status(500).send("Session data is corrupt.");
        }

        console.log("[IPN] completing draft order:", session.draftOrderId);

        const completedDraft = await completeDraftOrder(session.draftOrderId);
        const shopifyOrderId = String(completedDraft.order_id);

        console.log("[IPN] draft completed, shopifyOrderId:", shopifyOrderId);

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

        console.log("[IPN] payment record created");

        await PaymentSessionModel.updateOne(
            { transactionId },
            { $set: { status: "success" } }
        );

        console.log("[IPN] session status set to success");

        await logEvent(shopifyOrderId, "order", "completed", {
            draftOrderId: session.draftOrderId,
            shopifyOrderId,
            tran_id: data.tran_id,
            amount: session.amount
        });

        console.log("[IPN] order completion logged");

        const freshSession = await PaymentSessionModel.findOne({ transactionId }).lean();
        console.log("[IPN] fresh session emailSent:", freshSession?.emailSent);

        if (!freshSession?.emailSent) {
            console.log("[IPN] sending success email to:", session.customer.email);

            void sendEmail(
                session.customer.email,
                "Payment Successful",
                `
                    <h2>Payment Confirmed</h2>
                    <p>Your order has been successfully placed.</p>
                    <p><strong>Order ID:</strong> ${shopifyOrderId}</p>
                    <p><strong>Transaction ID:</strong> ${transactionId}</p>
                    <p>Amount: ${session.amount} ${session.currency}</p>
                `
            )
                .then(async () => {
                    console.log("[IPN] email sent successfully");

                    await PaymentSessionModel.updateOne(
                        { transactionId },
                        { $set: { emailSent: true } }
                    );

                    console.log("[IPN] emailSent set to true");
                })
                .catch((err) => {
                    console.error("[IPN] EMAIL ERROR:", err);
                    console.error("[IPN] EMAIL ERROR response:", err?.response);
                    console.error("[IPN] EMAIL ERROR code:", err?.code);
                    console.error("[IPN] EMAIL ERROR command:", err?.command);
                });
        } else {
            console.log("[IPN] email already marked sent, skipping");
        }

        console.log("[IPN] done, returning OK");
        return res.send("OK");
    } catch (err: any) {
        console.error("[IPN] ERROR:", err);
        console.error("[IPN] ERROR message:", err?.message);
        console.error("[IPN] ERROR response:", err?.response?.data);
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
            req.body?.value_b ?? (req.query?.value_b as string);

        if (transactionId) {
            const session = await PaymentSessionModel.findOne({
                transactionId
            }).lean();

            if (session?.status === "success") {
                return res.redirect(
                    `https://${envVars.SHOPIFY_STORE}/pages/payment-success`
                );
            }

            // IPN may not have fired yet — redirect anyway;
            // the order will appear once IPN completes
        }

        return res.redirect(
            `https://${envVars.SHOPIFY_STORE}/pages/payment-success`
        );
    } catch {
        return res.redirect(
            `https://${envVars.SHOPIFY_STORE}pages/payment-success`
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
            req.body?.value_b ?? (req.query?.value_b as string);

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
    return res.redirect(`https://${envVars.SHOPIFY_STORE}/pages/payment-failed`);
};