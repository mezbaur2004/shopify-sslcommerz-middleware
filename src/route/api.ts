import express, {Router,Request,Response} from "express";

import {
    createPayment,
    paymentIPN,
    paymentSuccess,
    paymentFail
} from "../controller/payment.controller";

const router:Router=express.Router();

router.get("/",(_req:Request,res:Response)=>{
    res.json("API is working!")
})

// router.post("/test-sanitize",(req:Request,res:Response)=>{
//     res.json(req.body);
// })


//payment gateway routes

router.post("/pay/:orderId", createPayment);

// NO rate limit here ideally (separate router if needed)
router.post("/payment/ipn", paymentIPN);
router.post("/payment/success", paymentSuccess);
router.post("/payment/fail", paymentFail);

export default router;