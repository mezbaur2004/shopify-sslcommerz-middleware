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
    await transporter.sendMail({
        from: '"Jolly Phonics Bangladesh" <info@jollylearningbd.com>',
        to,
        subject,
        html
    });
};