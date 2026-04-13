import nodemailer from "nodemailer";
import {envVars} from "../config/envVariable.config";

export const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    auth: {
        user: envVars.BREVO_USER,
        pass: envVars.BREVO_PASS
    }
});

export const sendEmail = async (to: string, subject: string, html: string) => {
    console.log("[EMAIL] sending to:", to);

    try {
        const info = await transporter.sendMail({
            from: '"Jolly Phonics Bangladesh" <info@jollylearningbd.com>',
            to,
            subject,
            html
        });

        console.log("[EMAIL] sent:", info.messageId);

        return info; // ✅ IMPORTANT
    } catch (err: any) {
        console.error("[EMAIL] ERROR:", err.message);
        throw err; // ✅ IMPORTANT
    }
};