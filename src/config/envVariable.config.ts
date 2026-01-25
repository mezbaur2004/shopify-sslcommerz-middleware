import dotenv from 'dotenv';
dotenv.config();

interface IEnvVariables{
    PORT: string;
    NODE_ENV: 'development' | 'production' | 'test';
    DB_URL: string;
    ORIGINS:string;
    BCRYPT_SALT_ROUNDS:string;
}

const loadEnvVariables = ():IEnvVariables=>{
    const requiredEnvVars=[
        "PORT","NODE_ENV","DB_URL","ORIGINS","BCRYPT_SALT_ROUNDS",
    ];
    requiredEnvVars.forEach((varName)=>{
        if(!process.env[varName]){
            throw new Error(`Invalid env variable: ${varName}, Please define it in the .`);
        }
    })
    return {
        PORT: process.env.PORT as string,
        NODE_ENV:process.env.DB_URL as 'development' | 'production' | 'test',
        DB_URL: process.env.DB_URL as string,
        ORIGINS: process.env.CLIENT_SITE_URL as string,
        BCRYPT_SALT_ROUNDS: process.env.BCRYPT_SALT_ROUNDS as string,

    }
}

export const envVars=loadEnvVariables();