import { Request, Response } from "express";
import { createSSLSession, validateSSLPayment } from "../service/ssl.service";
import { getOrder, markOrderPaid } from "../service/shopify.service";
import {envVars} from "../config/envVariable.config";

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

        const order = await getOrder(orderId);
        if (!order) return res.status(404).send("Order not found");

        const isValid = await validateSSLPayment(data, order);
        if (!isValid) return res.status(400).send("Invalid payment");

        // extra fraud check
        if (!data.tran_id || !data.tran_id.startsWith(orderId)) {
            return res.status(400).send("Invalid transaction");
        }

        const sslAmount = parseFloat(data.amount);
        const orderAmount = parseFloat(order.total_price);

        if (isNaN(sslAmount) || sslAmount !== orderAmount) {
            return res.status(400).send("Amount mismatch");
        }

        if (order.financial_status === "paid") {
            return res.send("Already processed");
        }

        await markOrderPaid(orderId, data, order);

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


// export const paymentSuccess = async (_req: Request, res: Response) => {
//     return res.redirect(`${envVars.FRONTEND_URL}/success`);
// };
//
// export const paymentFail = async (_req: Request, res: Response) => {
//     return res.redirect(`${envVars.FRONTEND_URL}/fail`);
// };