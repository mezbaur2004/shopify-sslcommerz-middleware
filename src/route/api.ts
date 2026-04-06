import express, { Router, Request, Response } from "express";
import {
    initPayment,
    redirectToSSL,
    paymentIPN,
    paymentSuccess,
    paymentFail
} from "../controller/payment.controller";
import {onlyIpWhiteListed} from "../middleware/ipnGuard";

const router: Router = express.Router();

router.get("/", (_req: Request, res: Response) => {
    res.json({ ok: true, message: "Payment API is running" });
});

// ── Checkout init: receives full form data, creates draft order ──────────
router.post("/payment/init", initPayment);

// ── Browser redirect: opens SSLCommerz gateway ──────────────────────────
router.get("/payment/redirect/:transactionId", redirectToSSL);

// ── SSLCommerz server-to-server IPN (business logic lives here) ──────────
router.post("/payment/ipn",onlyIpWhiteListed, paymentIPN);

// ── Browser redirects after SSLCommerz gateway (UX only) ────────────────
router.all("/payment/success",onlyIpWhiteListed, paymentSuccess);
router.all("/payment/fail",onlyIpWhiteListed, paymentFail);

export default router;