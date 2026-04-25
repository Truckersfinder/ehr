import { Router } from "express";
import bcrypt from "bcryptjs";
import { parseIntegrationApiKey } from "./api-key";
import { signIntegrationAccessToken } from "./integration-jwt";
import { storage } from "../storage";

export function createIntegrationOAuthRouter(): Router {
  const r = Router();

  r.post("/token", async (req, res) => {
    const grant = String(req.body?.grant_type ?? "");
    if (grant !== "client_credentials") {
      return res.status(400).json({
        error: {
          code: "UNSUPPORTED_GRANT_TYPE",
          message: "Only grant_type=client_credentials is supported.",
        },
      });
    }

    // Prefer HTTP Basic auth (RFC 6749 client authentication), fallback to body fields.
    let clientId = "";
    let clientSecret = "";
    const auth = req.headers.authorization;
    if (auth?.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
        const idx = decoded.indexOf(":");
        if (idx > 0) {
          clientId = decoded.slice(0, idx).trim();
          clientSecret = decoded.slice(idx + 1).trim();
        }
      } catch {
        // ignore
      }
    }
    if (!clientId || !clientSecret) {
      clientId = String(req.body?.client_id ?? "").trim();
      clientSecret = String(req.body?.client_secret ?? "").trim();
    }
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: { code: "INVALID_REQUEST", message: "client_id and client_secret are required." },
      });
    }

    let key = await storage.getIntegrationApiKeyById(clientId);
    if (!key?.isActive) {
      return res.status(401).json({
        error: { code: "INVALID_CLIENT", message: "Unknown or inactive client_id." },
      });
    }
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return res.status(401).json({
        error: { code: "INVALID_CLIENT", message: "API key has expired." },
      });
    }

    let ok = false;
    const parsed = parseIntegrationApiKey(clientSecret);
    if (parsed && parsed.id === clientId) {
      ok = bcrypt.compareSync(parsed.secret, key.secretHash);
    } else {
      ok = bcrypt.compareSync(clientSecret, key.secretHash);
    }

    if (!ok) {
      return res.status(401).json({
        error: { code: "INVALID_CLIENT", message: "Invalid client_secret." },
      });
    }

    const access_token = signIntegrationAccessToken(key);
    return res.json({
      access_token,
      token_type: "Bearer",
      expires_in: 3600,
    });
  });

  return r;
}
