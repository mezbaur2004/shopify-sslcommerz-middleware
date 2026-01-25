# 🚀 TypeScript Express Server Template

A simple starter project with **Express.js + TypeScript**.  
It already has middlewares like CORS, Helmet, rate limiting, and input sanitization set up so you can focus on building APIs.

## ✨ Features

- TypeScript for safer code
- Express.js backend
- Security middlewares: helmet, hpp, rate limiting, input sanitization
- Configurable CORS
- Cookie parsing ready to use
- Organized folders for routes, middlewares, and DB connection
- Async DB connection setup (`connectDB`)
- Easy to add new routes or controllers

## ⚙️ Environment Variables

Create a `.env` file:

```
PORT=8080
NODE_ENV=development
ORIGINS=http://localhost:3000
DB=mongodb+srv://<your-db-connection-string>
```

## 🚀 Getting Started

1. Clone this repo:

```
git clone https://github.com/mezbaur2004/typescript-express-structure.git
cd typescript-express-structure
```

2. Install dependencies:

```
npm install
```

3. Run the dev server:

```
npm run dev
```

The server will run on the port you set in `.env` (default 8080).

Open `http://localhost:8080/api` in your browser — you should see:

```
{
  "message": "API is working!"
}
```

You can add new routes in `src/route/api.ts` — it’s super easy.

## 🧑‍💻 Author

Mezbaur Are Rafi – [GitHub](https://github.com/mezbaur2004)
