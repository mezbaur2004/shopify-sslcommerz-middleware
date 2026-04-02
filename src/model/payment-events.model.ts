import mongoose from "mongoose";

const Schema = mongoose.Schema;

const PaymentEventSchema = new Schema(
    {
        // holds draft_order_id initially, replaced by real order_id after completion
        reference_id: {
            type: String,
            required: true,
            index: true
        },

        reference_type: {
            type: String,
            enum: ["draft_order", "order"],
            required: true
        },

        event_type: {
            type: String,
            enum: [
                "created",
                "redirected",
                "ipn_received",
                "verified",
                "completed",
                "failed",
                "cancelled",
                "expired",
                "refunded"
            ],
            required: true
        },

        payload: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    { timestamps: true, versionKey: false }
);

PaymentEventSchema.index({ reference_id: 1, event_type: 1 });

const PaymentEventModel = mongoose.model("payment_events", PaymentEventSchema);
export default PaymentEventModel;