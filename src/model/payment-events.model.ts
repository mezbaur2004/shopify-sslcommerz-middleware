import mongoose from "mongoose";

const Schema = mongoose.Schema;

const PaymentEventSchema = new Schema(
    {
        shopify_order_id: {
            type: String,
            required: true,
            index: true
        },

        event_type: {
            type: String,
            enum: [
                "created",
                "redirected",
                "ipn_received",
                "verified",
                "failed",
                "cancelled",
                "refunded"
            ],
            required: true
        },

        payload: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    { timestamps: true,versionKey:false }
);

const PaymentEventModel= mongoose.model("payment_events", PaymentEventSchema);

export default PaymentEventModel;