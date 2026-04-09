//currently not using it. because render free tier sleeps after inactivity

import PaymentSessionModel from "../model/payment-session.model";
import PaymentEventModel from "../model/payment-events.model";
import { deleteDraftOrder } from "../service/shopify.service";

const INTERVAL_MS = 60 * 1000; // run every minute

const runCleanup = async () => {
    try {
        const now = new Date();

        // Find all pending sessions whose TTL has passed
        const expiredSessions = await PaymentSessionModel.find({
            status: "pending",
            expiryTime: { $lt: now }
        }).lean();

        if (expiredSessions.length === 0) return;

        console.log(`[Cleanup] Processing ${expiredSessions.length} expired session(s)...`);

        for (const session of expiredSessions) {
            try {
                // 1. Delete the Shopify draft order so stock is released
                if (session.draftOrderId) {
                    await deleteDraftOrder(session.draftOrderId);
                    console.log(`[Cleanup] Deleted draft order ${session.draftOrderId}`);
                }

                // 2. Mark session as expired
                await PaymentSessionModel.updateOne(
                    { _id: session._id },
                    { $set: { status: "expired" } }
                );

                // 3. Audit log
                await PaymentEventModel.create({
                    reference_id: session.draftOrderId || String(session._id),
                    reference_type: "draft_order",
                    event_type: "expired",
                    payload: {
                        reason: "Automatically expired after 15-minute TTL",
                        transactionId: session.transactionId,
                        expiredAt: now
                    }
                });

            } catch (innerErr: any) {
                // Don't let one failure block the rest
                console.error(
                    `[Cleanup] Failed to process session ${session._id}:`,
                    innerErr.message
                );
            }
        }

    } catch (err: any) {
        console.error("[Cleanup] Job error:", err.message);
    }
};

export const startExpiredSessionCleanup = () => {
    console.log("[Cleanup] Expired session cleanup job started (interval: 60s)");
    runCleanup(); // run once immediately on boot
    setInterval(runCleanup, INTERVAL_MS);
};