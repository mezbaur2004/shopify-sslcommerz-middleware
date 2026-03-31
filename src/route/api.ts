import express, {Router,Request,Response} from "express";

import {
    createPayment,
    paymentIPN,
    paymentSuccess,
    paymentFail,
    initPaymentFromCart, redirectToSSL, redirectShopifyToSSL
} from "../controller/payment.controller";

const router:Router=express.Router();

router.get("/",(_req:Request,res:Response)=>{
    res.json("API is working!")
})

//payment gateway routes
router.post("/payment/init", initPaymentFromCart);
router.post("/pay/:orderId", createPayment);

router.get("/payment/redirect/:paymentRef", redirectToSSL);
router.get("/payment/shopify-redirect/:paymentRef", redirectShopifyToSSL);

// NO rate limit here ideally (separate router if needed)
router.post("/payment/ipn", paymentIPN);
router.post("/payment/success", paymentSuccess);
router.post("/payment/fail", paymentFail);

export default router;