import mongoose from "mongoose";

const Schema = mongoose.Schema;

const PaymentSessionSchema = new Schema(
    {
        cartToken: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        draftOrderId: {
            type: String,
            required: true,
            index: true
        },

        transactionId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        status: {
            type: String,
            enum: ["pending", "success", "failed", "expired"],
            default: "pending",
            index: true
        },

        amount: {
            type: Number,
            required: true
        },

        currency: {
            type: String,
            default: "BDT"
        },

        expiryTime: {
            type: Date,
            required: true,
            index: true
        },

        customer: {
            name: { type: String, required: true },
            email: { type: String, required: true, index: true },
            phone: { type: String, default: null }
        },

        shippingAddress: {
            address1: { type: String, required: true },
            address2: { type: String, default: null },
            city: { type: String, required: true },
            province: { type: String, default: null },
            country: { type: String, required: true },
            zip: { type: String, default: null }
        },

        meta: {
            ip: { type: String, default: null },
            userAgent: { type: String, default: null }
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

const PaymentSessionModel = mongoose.model("payment_sessions", PaymentSessionSchema);
export default PaymentSessionModel;