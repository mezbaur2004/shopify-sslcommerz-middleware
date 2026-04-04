import mongoose from "mongoose";
import { envVars } from "./config/envVariable.config";

const URL = envVars.DB_URL;

export const connectDB = async () => {
    try {
        await mongoose.connect(URL, {
            autoIndex: true
        });
        console.log("MongoDB Connected");
    } catch (err) {
        console.log("DB connection error:", err);
        process.exit(1);
    }
};
