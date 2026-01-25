import * as mongoose from "mongoose";
import {envVars} from "./config/envVariable.config";

const URL=envVars.DB_URL
const option: { user: string, pass: string, autoIndex: boolean } = {user: '', pass: '', autoIndex: true}
export const connectDB=async()=>{
        mongoose.connect(URL, option).then((): void => {
            console.log("MongoDB Connected");
        }).catch((err): void => {
            console.log("DB connection error:" + err);
            process.exit(1);
        });
}
