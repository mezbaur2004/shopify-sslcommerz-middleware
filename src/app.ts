import express, {Application, Request, Response} from "express"
import router from "./route/api"
import rateLimit, {RateLimitRequestHandler} from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import cors, { CorsOptions } from "cors";
import cookieParser from "cookie-parser";
import {sanitizeMiddleware} from "./middleware/sanitize";
import {envVars} from "./config/envVariable.config";

const app: Application = express();

//middleware
// 1. Sanitize the ORIGINS string
const origins: string[] = envVars.ORIGINS
    ?.split(",")
    .map(o => o.trim().replace(/\/$/, "")) ?? [];

const corsOptions: CorsOptions = {
    origin: function (origin: any, callback: any) {
        // Allow IPN / Server-to-Server
        if (!origin) return callback(null, true);

        const cleanOrigin = origin.replace(/\/$/, "");

        // Match your list OR any SSLCommerz domain
        if (origins.includes(cleanOrigin) || origin.includes("sslcommerz.com")) {
            return callback(null, true);
        }

        // IMPORTANT: Use (null, false) instead of (new Error)
        // This stops the server from crashing and just denies the origin.
        return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
};

app.use(cors(corsOptions));


// Handle preflight for all routes
app.options(/^(.*)$/, cors(corsOptions));

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({limit: '1mb', extended: true}));

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "unsafe-none" }
}));

app.use(hpp());

app.use(sanitizeMiddleware);

const limiter: RateLimitRequestHandler = rateLimit({
    windowMs: 3 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests. Try again later"
});
app.use(limiter);



app.use("/api/v1", router);
app.use((_req: Request, res: Response): void => {
    res.status(404).send("Not Found");
})

export default app;