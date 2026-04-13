import axios from "axios";

export const sendEmail = async (
    to: string,
    subject: string,
    html: string
) => {
    console.log("[EMAIL] sending via Brevo API...");

    const res = await axios.post(
        "https://api.brevo.com/v3/smtp/email",
        {
            sender: {
                name: "Jolly Learning",
                email: "your_verified_email@domain.com", // MUST be verified in Brevo
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

    console.log("[EMAIL] sent:", res.data);
};