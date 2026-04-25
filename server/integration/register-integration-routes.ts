import express, { type Express } from "express";
import { integrationAuthMiddleware } from "./middleware";
import { createIntegrationOAuthRouter } from "./oauth-routes";
import { mountIntegrationV1Routes } from "./v1-routes";
import { startIntegrationWebhookWorker } from "./webhook-worker";

/** Public OAuth2-style token endpoint + authenticated `/api/v1/*` integration API. */
export function registerIntegrationRoutes(app: Express): void {
  app.use("/api/v1/oauth", express.json(), express.urlencoded({ extended: true }), createIntegrationOAuthRouter());

  const v1 = express.Router();
  v1.use(express.json({ limit: "2mb" }));
  v1.use(integrationAuthMiddleware);
  mountIntegrationV1Routes(v1);
  app.use("/api/v1", v1);

  startIntegrationWebhookWorker();
}
