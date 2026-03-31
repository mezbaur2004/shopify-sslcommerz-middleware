import { Request, Response } from "express";
import { createSSLSession, validateSSLPayment } from "../service/ssl.service";
import { getOrder, markOrderPaid } from "../service/shopify.service";
import { envVars } from "../config/envVariable.config";
import PaymentModel from "../model/payments.model";

export const initPaymentFromCart=async (req:Request, res:Response) => {
    res.status(200).send({message:"Init Payment Route Working Server To Server"})
}

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

        const existingPayment = await PaymentModel.findOne({
            shopify_order_id: String(orderId)
        });

        if (existingPayment?.status === "paid") {
            return res.json({ message: "Already paid" });
        }

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
                    transaction_id: null,
                    customer_email: order.email || null,
                    paid_at: null
                }
            },
            { upsert: true, new: true }
        );

        const session = await createSSLSession(order);

        if (!session?.GatewayPageURL) {
            return res.status(500).json({ error: "Payment init failed" });
        }

        return res.json({ url: session.GatewayPageURL });
    } catch (err: any) {
        console.error("CREATE PAYMENT ERROR:", err.message);
        return res.status(500).json({ error: "Payment init failed" });
    }
};

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

        if (!payment) {
            return res.status(404).send("Payment record not found");
        }

        if (payment.status === "paid") {
            return res.send("Already processed");
        }

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

        if (!data.tran_id || !data.tran_id.startsWith(String(orderId))) {
            await PaymentModel.updateOne(
                { shopify_order_id: String(orderId) },
                { $set: { status: "failed" } }
            );
            return res.status(400).send("Invalid transaction");
        }

        const sslAmount = parseFloat(data.amount);
        const paymentAmount = Number(payment.amount);

        if (isNaN(sslAmount) || sslAmount !== paymentAmount) {
            await PaymentModel.updateOne(
                { shopify_order_id: String(orderId) },
                { $set: { status: "failed" } }
            );
            return res.status(400).send("Amount mismatch");
        }

        if (order.financial_status === "paid") {
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
            return res.send("Already processed");
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

        console.log("PAYMENT SUCCESS:", {
            orderId,
            amount: sslAmount,
            tran_id: data.tran_id
        });

        return res.send("OK");
    } catch (err: any) {
        console.error("IPN ERROR:", err.response?.data || err.message);
        return res.status(500).send("Error");
    }
};

export const paymentSuccess = async (_req: Request, res: Response) => {
    return res.redirect(`https://${envVars.SHOPIFY_STORE}/account/orders`);
};

export const paymentFail = async (_req: Request, res: Response) => {
    return res.redirect(`https://${envVars.SHOPIFY_STORE}/account/orders`);
};