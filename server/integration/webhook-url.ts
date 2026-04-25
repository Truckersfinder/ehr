const PRIVATE_HOSTS = new Set(["localhost"]);

function isIpLiteral(hostname: string): boolean {
  // IPv4 basic; IPv6 literal will include ':' or be bracketed in URL parsing.
  if (hostname.includes(":")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((x) => parseInt(x, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function allowedHosts(): string[] | null {
  const raw = process.env.INTEGRATION_WEBHOOK_ALLOWED_HOSTS?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, message: "Invalid URL" };
  }

  if (u.protocol !== "https:") {
    return { ok: false, message: "Webhook URL must be https://" };
  }
  if (u.username || u.password) {
    return { ok: false, message: "Webhook URL must not include credentials" };
  }
  if (!u.hostname) {
    return { ok: false, message: "Webhook URL hostname required" };
  }

  const host = u.hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host.endsWith(".local")) {
    return { ok: false, message: "Webhook URL hostname is not allowed" };
  }

  if (isIpLiteral(host)) {
    if (host.includes(":")) return { ok: false, message: "IP literal hosts are not allowed" };
    if (isPrivateIpv4(host)) return { ok: false, message: "Private IP hosts are not allowed" };
    return { ok: false, message: "IP literal hosts are not allowed" };
  }

  const allow = allowedHosts();
  if (allow && !allow.includes(host)) {
    return { ok: false, message: "Webhook host is not in allowlist" };
  }

  return { ok: true, url: u.toString() };
}

