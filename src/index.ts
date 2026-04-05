import app from "./app";
import {connectDB} from "./db";
import mongoose from "mongoose";
import { Server } from "http";
import {envVars} from "./config/envVariable.config";
import * as dns from "node:dns";

if(envVars.NODE_ENV === "development") {
    let prevDNS=dns.getServers()
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
    let newDNS=dns.getServers();
    console.log(`DNS ${prevDNS} is set to ${newDNS}`);

}

let server: Server;


const PORT:number=Number(envVars.PORT);

const startServer=async () => {
    await connectDB();
    server=app.listen(PORT,()=>{
        console.log(`Server running on http://localhost:${PORT}`)
    })
}

startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});

//Graceful shutdown

const shutdown = (reason: string, err?: unknown) => {
    console.error(`Shutting down: ${reason}`, err ?? "");

    // stop accepting new connections
    if (server) server.close(() => console.log("HTTP server closed"));

    // example: close mongoose if used
    if (mongoose.connection.readyState) {
      mongoose.connection.close(false).then(() => console.log("Mongoose closed"));
    }

    // force exit if cleanup takes too long
    setTimeout(() => {
        console.error("Forcing shutdown");
        process.exit(1);
    }, 5000).unref();
};

process.on("SIGTERM",()=>shutdown("SIGTERM received"));
process.on("SIGINT", () => shutdown("SIGINT received"));

process.on("uncaughtException", (error) => {
    shutdown("Uncaught Exception", error);
});

process.on("unhandledRejection", (reason) => {
    shutdown("Unhandled Rejection", reason);
});