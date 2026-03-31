import dotenv from 'dotenv';
dotenv.config();

interface IEnvVariables{
    PORT: string;
    NODE_ENV: 'development' | 'production' | 'test';
    DB_URL: string;
    ORIGINS:string;
    SHOPIFY_STORE:string;
    SHOPIFY_ADMIN_TOKEN:string;
    SHOPIFY_API_VERSION:string;
    SSL_STORE_ID:string;
    SSL_STORE_PASS:string;
    BASE_URL:string;
    FRONTEND_URL:string;
    SHOPIFY_LOCATION_ID:string;
}

const loadEnvVariables = ():IEnvVariables=>{
    const requiredEnvVars=[
        "PORT","NODE_ENV","DB_URL","ORIGINS","SHOPIFY_STORE","SHOPIFY_ADMIN_TOKEN","SHOPIFY_API_VERSION","SSL_STORE_ID","SSL_STORE_PASS","BASE_URL","FRONTEND_URL","SHOPIFY_LOCATION_ID"
    ];
    requiredEnvVars.forEach((varName)=>{
        if(!process.env[varName]){
            throw new Error(`Invalid env variable: ${varName}, Please define it in the .`);
        }
    })
    return {
        PORT: process.env.PORT as string,
        NODE_ENV:process.env.NODE_ENV as 'development' | 'production' | 'test',
        DB_URL: process.env.DB_URL as string,
        ORIGINS: process.env.ORIGINS as string,
        SHOPIFY_STORE: process.env.SHOPIFY_STORE as string,
        SHOPIFY_ADMIN_TOKEN: process.env.SHOPIFY_ADMIN_TOKEN as string,
        SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION as string,
        SSL_STORE_ID: process.env.SSL_STORE_ID as string,
        SSL_STORE_PASS: process.env.SSL_STORE_PASS as string,
        BASE_URL: process.env.BASE_URL as string,
        FRONTEND_URL: process.env.FRONTEND_URL as string,
        SHOPIFY_LOCATION_ID: process.env.SHOPIFY_LOCATION_ID as string,
    }
}

export const envVars=loadEnvVariables();