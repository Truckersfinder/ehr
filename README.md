# EHR

## Local development

**Recommended:** run **`npm run dev`** and open **http://127.0.0.1:3000** — API and UI share one server.

If you open the UI on **Vite’s port (5173)** (e.g. “Open in Browser” from a Vite-only process), **`/api` must still reach Express on port 3000**. With this repo:

1. In one terminal: **`npm run dev`** (API on **3000**), **or** at minimum `PORT=3000 tsx server/index.ts`.
2. Then you can use the Vite dev server on **5173**; the client automatically forwards `/api` and `/uploads` to **http://127.0.0.1:3000** (see `client/src/lib/dev-api-fetch.ts`).

- Copy `.env.example` to `.env` and set `DATABASE_URL`

Production and hosted environments should set `PORT` as required by the platform; otherwise the server defaults to **3000**.
