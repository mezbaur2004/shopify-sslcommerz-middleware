import { Request, Response, NextFunction } from "express";
import { envVars } from "../config/envVariable.config";
import paymentsModel from "../model/payments.model";

const SSL_IPS =
    envVars.SSL_IPS?.split(",").map(ip => ip.trim()) ?? [];

const normalizeIP = (ip: string) => ip.replace("::ffff:", "");

export const onlyIpWhiteListed = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    let ip: string | undefined;

    const forwarded = req.headers["x-forwarded-for"];
    console.log(forwarded);
    console.log(req.headers);
    await paymentsModel.create({shopify_order_id: "5836136480845",
        draft_order_id: forwarded,
        cart_token: "cart_999476297805_1775452696217",
        status: "paid",
        amount: 910,
        currency: "BDT",
        gateway: "test",
        transaction_id: "txn_1775452696217_6tgap7",
        customer_email: "mezbaur2004@gmail.com",
        ipn_verified: true,
        })
    if (typeof forwarded === "string") {
        ip = forwarded.split(",")[0]?.trim();
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
        // Fix: Explicitly check length to satisfy TS2532
        ip = forwarded[0];
    } else {
        ip = req.socket.remoteAddress;
    }

    const cleanIP = ip ? normalizeIP(ip) : null;

    // Optional: Allow localhost/internal testing if in dev mode
    if (process.env.NODE_ENV === "development" && (cleanIP === "127.0.0.1" || cleanIP === "::1")) {
        return next();
    }

    if (!cleanIP || !SSL_IPS.includes(cleanIP)) {
        console.warn("Blocked IPN request from:", cleanIP);
        return res.status(403).send("Forbidden");
    }

    next();
};