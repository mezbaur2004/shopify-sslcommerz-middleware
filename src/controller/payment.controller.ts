import { Request, Response } from "express";
import { createSSLSession, validateSSLPayment } from "../service/ssl.service";
import { getOrder, markOrderPaid } from "../service/shopify.service";
import { envVars } from "../config/envVariable.config";
import PaymentModel from "../model/payments.model";

//
// 1. INIT PAYMENT (FAST - NO EXTERNAL CALLS)
//
export const initPaymentFromCart = async (req: Request, res: Response) => {
    try {
        const { cartToken, amount, currency = "BDT", customerEmail } = req.body;

        if (!cartToken) {
            return res.status(400).json({ message: "cartToken is required" });
        }

        if (!amount || Number.isNaN(Number(amount))) {
            return res.status(400).json({ message: "Valid amount is required" });
        }

        const paymentRef = `cart_${Date.now()}`;

        await PaymentModel.findOneAndUpdate(
            { cart_token: cartToken },
            {
                $set: {
                    cart_token: cartToken,
                    shopify_order_id: null,
                    amount: Number(amount),
                    currency,
                    gateway: "sslcommerz",
                    status: "pending",
                    ipn_verified: false,
                    transaction_id: paymentRef,
                    customer_email: customerEmail ?? null,
                    paid_at: null
                }
            },
            { upsert: true, new: true }
        );

        // IMPORTANT: DO NOT CALL SSL HERE
        return res.json({
            ok: true,
            redirect: `/api/v1/payment/redirect/${paymentRef}`
        });

    } catch (err: any) {
        console.error("INIT PAYMENT ERROR:", err.message);
        return res.status(500).json({ message: "Payment init failed" });
    }
};

//
// 2. REDIRECT TO SSL (SLOW - SAFE PLACE FOR EXTERNAL CALL)
//
export const redirectToSSL = async (req: Request, res: Response) => {
    try {
        const { paymentRef } = req.params;

        const payment = await PaymentModel.findOne({
            transaction_id: paymentRef
        });

        if (!payment) {
            return res.status(404).send("Payment not found");
        }

        const session = await createSSLSession({
            amount: payment.amount,
            currency: payment.currency,
            transaction_id: payment.transaction_id,
            cart_token: payment.cart_token,
            customer_email: payment.customer_email
        });

        if (!session?.GatewayPageURL) {
            return res.status(500).send("SSL session failed");
        }

        return res.redirect(session.GatewayPageURL);

    } catch (err: any) {
        console.error("SSL REDIRECT ERROR:", err.message);
        return res.status(500).send("Payment redirect failed");
    }
};

//
// 3. SHOPIFY ORDER PAYMENT (FIXED SAME ISSUE)
//
export const createPayment = async (req: Request, res: Response) => {
    try {
        const raw = req.params.orderId;
        const orderId = Array.isArray(raw) ? raw[0] : raw;

        if (!orderId || !/^\d+$/.test(orderId)) {
            return res.status(400).json({ message: "Invalid orderId" });
        }

        const order = await getOrder(orderId);
        if (!order) return res.status(404).json({ message: "Order not found" });

        if (order.financial_status === "paid") {
            return res.json({ message: "Already paid" });
        }

        const amount = Number(order.total_price);
        if (Number.isNaN(amount)) {
            return res.status(400).json({ message: "Invalid order amount" });
        }

        const paymentRef = `order_${orderId}_${Date.now()}`;

        await PaymentModel.findOneAndUpdate(
            { shopify_order_id: String(orderId) },
            {
                $set: {
                    shopify_order_id: String(orderId),
                    cart_token: null,
                    amount,
                    currency: order.currency || "BDT",
                    gateway: "sslcommerz",
                    status: "pending",
                    ipn_verified: false,
                    transaction_id: paymentRef,
                    customer_email: order.email || null,
                    paid_at: null
                }
            },
            { upsert: true, new: true }
        );

        // IMPORTANT: DO NOT CALL SSL HERE
        return res.json({
            ok: true,
            redirect: `/api/v1/payment/shopify-redirect/${paymentRef}`
        });

    } catch (err: any) {
        console.error("CREATE PAYMENT ERROR:", err.message);
        return res.status(500).json({ error: "Payment init failed" });
    }
};

//
// 4. SHOPIFY REDIRECT → SSL
//
export const redirectShopifyToSSL = async (req: Request, res: Response) => {
    try {
        const { paymentRef } = req.params;

        const payment = await PaymentModel.findOne({
            transaction_id: paymentRef
        });

        if (!payment) {
            return res.status(404).send("Payment not found");
        }

        const session = await createSSLSession({
            amount: payment.amount,
            currency: payment.currency,
            transaction_id: payment.transaction_id,
            customer_email: payment.customer_email
        });

        if (!session?.GatewayPageURL) {
            return res.status(500).send("SSL session failed");
        }

        return res.redirect(session.GatewayPageURL);

    } catch (err: any) {
        console.error("SHOPIFY SSL REDIRECT ERROR:", err.message);
        return res.status(500).send("Payment redirect failed");
    }
};

//
// 5. IPN (KEEP AS IS - CORE LOGIC IS CORRECT)
//
export const paymentIPN = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        if (!data) return res.status(400).send("Invalid payload");

        const raw = data.value_a;
        const orderId = Array.isArray(raw) ? raw[0] : raw;

        if (!orderId || !/^\d+$/.test(orderId)) {
            return res.status(400).send("Invalid orderId");
        }

        const payment = await PaymentModel.findOne({
            shopify_order_id: String(orderId)
        });

        if (!payment) return res.status(404).send("Payment record not found");

        const order = await getOrder(orderId);
        if (!order) return res.status(404).send("Order not found");

        const isValid = await validateSSLPayment(data, order);
        if (!isValid) {
            await PaymentModel.updateOne(
                { shopify_order_id: String(orderId) },
                { $set: { status: "failed" } }
            );
            return res.status(400).send("Invalid payment");
        }

        const sslAmount = parseFloat(data.amount);
        if (sslAmount !== Number(payment.amount)) {
            await PaymentModel.updateOne(
                { shopify_order_id: String(orderId) },
                { $set: { status: "failed" } }
            );
            return res.status(400).send("Amount mismatch");
        }

        await markOrderPaid(orderId, data, order);

        await PaymentModel.updateOne(
            { shopify_order_id: String(orderId) },
            {
                $set: {
                    status: "paid",
                    transaction_id: data.tran_id,
                    ipn_verified: true,
                    paid_at: new Date()
                }
            }
        );

        return res.send("OK");

    } catch (err: any) {
        console.error("IPN ERROR:", err.message);
        return res.status(500).send("Error");
    }
};

//
// 6. FINAL REDIRECTS
//
export const paymentSuccess = async (_req: Request, res: Response) => {
    return res.redirect(`https://${envVars.SHOPIFY_STORE}/account/orders`);
};

export const paymentFail = async (_req: Request, res: Response) => {
    return res.redirect(`https://${envVars.SHOPIFY_STORE}/account/orders`);
};