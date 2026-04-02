import mongoose from "mongoose";

const Schema = mongoose.Schema;

const PaymentSchema = new Schema(
    {
        shopify_order_id: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        draft_order_id: {
            type: String,
            default: null,
            index: true
        },

        cart_token: {
            type: String,
            default: null,
            index: true
        },

        status: {
            type: String,
            enum: ["pending", "processing", "paid", "failed", "cancelled", "refunded"],
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

        gateway: {
            type: String,
            default: "sslcommerz"
        },

        transaction_id: {
            type: String,
            default: null,
            index: true
        },

        customer_email: {
            type: String,
            default: null
        },

        ipn_verified: {
            type: Boolean,
            default: false
        },

        paid_at: {
            type: Date,
            default: null
        }
    },
    { timestamps: true, versionKey: false }
);

PaymentSchema.index({ status: 1, createdAt: -1 });

const PaymentModel = mongoose.model("payments", PaymentSchema);
export default PaymentModel;