import axios from "axios";
import {envVars} from "../config/envVariable.config";

export const sendEmail = async (
    to: string,
    subject: string,
    html: string
) => {

    const res = await axios.post(
        "https://api.brevo.com/v3/smtp/email",
        {
            sender: {
                name: "Jolly Phonics Bangladesh",
                email: envVars.BREVO_VERIFIED_EMAIL, // MUST be verified in Brevo
            },
            to: [{ email: to }],
            subject,
            htmlContent: html,
        },
        {
            headers: {
                "api-key": process.env.BREVO_API_KEY!,
                "Content-Type": "application/json",
            },
            timeout: 10000,
        }
    );
};