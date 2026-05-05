import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { Resend } from "resend";
import { storage } from "./storage";

function resendErrorMessage(raw: string | undefined): string {
  let msg = raw ?? "Email send failed";
  if (/testing emails to your own email/i.test(msg)) {
    msg +=
      " — For testing without a verified domain, set the patient’s portal or contact email to your Resend account address; or verify a domain at resend.com/domains and set RESEND_FROM_EMAIL.";
  }
  if (/domain is not verified/i.test(msg)) {
    msg +=
      " — In Resend → Domains, that domain must show Verified (DNS records added at your DNS host; can take a while to propagate). RESEND_FROM_EMAIL must be an address on that same domain. RESEND_API_KEY must be from the same Resend account that added the domain. Restart the app after changing .env.";
  }
  return msg;
}

/** Normalize recipient for providers (e.g. Gmail) that treat addresses case-insensitively. */
function normalizeRecipientEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Base URL for links emailed to patients (no trailing slash). */
export function getPatientPortalBaseUrl(): string {
  const raw = process.env.PATIENT_PORTAL_BASE_URL || process.env.PUBLIC_APP_URL || "";
  const t = raw.replace(/\/$/, "").trim();
  return t || "http://127.0.0.1:3000";
}

type SendInviteOpts = {
  toEmail: string;
  patientFirstName: string;
  facilityName: string;
  senderDisplayName: string;
  fromAddress: string;
  portalUrl: string;
};

export async function sendPatientPortalInviteEmail(
  opts: SendInviteOpts,
): Promise<{ ok: true; resendEmailId: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  const qrDataUrl = await QRCode.toDataURL(opts.portalUrl, { width: 240, margin: 2, errorCorrectionLevel: "M" });

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p>Hello ${escapeHtml(opts.patientFirstName)},</p>
  <p><strong>${escapeHtml(opts.facilityName)}</strong> has invited you to access your medical record through our secure patient portal.</p>
  <p>Use the link below on your phone or computer. The first time you open it, you will create a personal PIN. You will need that PIN for all future visits.</p>
  <p style="margin: 1.5rem 0;">
    <a href="${escapeHtml(opts.portalUrl)}" style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px;">Open your patient portal</a>
  </p>
  <p style="word-break: break-all; font-size: 14px; color: #444;">${escapeHtml(opts.portalUrl)}</p>
  <p style="margin-top: 1.5rem;">Or scan this QR code:</p>
  <p><img src="${qrDataUrl}" alt="Patient portal QR code" width="240" height="240" style="display:block;border:0;" /></p>
  <p style="font-size: 13px; color: #666;">If you did not expect this message, you can ignore it.</p>
  <p style="font-size: 13px; color: #666;">— ${escapeHtml(opts.facilityName)}</p>
</body>
</html>`;

  const text = [
    `Hello ${opts.patientFirstName},`,
    "",
    `${opts.facilityName} has invited you to access your medical record through our secure patient portal.`,
    "",
    `Open your patient portal (create a PIN the first time):`,
    opts.portalUrl,
    "",
    "If you did not expect this message, you can ignore it.",
    `— ${opts.facilityName}`,
  ].join("\n");

  const toEmail = normalizeRecipientEmail(opts.toEmail);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: `${opts.senderDisplayName} <${opts.fromAddress}>`,
    to: toEmail,
    subject: `${opts.facilityName} — Your patient portal`,
    html,
    text,
  });

  if (error) return { ok: false, error: resendErrorMessage(error.message) };
  const resendEmailId = data?.id;
  if (!resendEmailId) {
    console.warn("[patient portal] Resend returned success but no email id", { data });
    return { ok: false, error: "Email service returned an unexpected response" };
  }
  console.info("[patient portal] invite email accepted by Resend", { resendEmailId, to: toEmail, from: opts.fromAddress });
  return { ok: true, resendEmailId };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPatientPortalLoginReminderEmail(
  patientId: string,
): Promise<{ ok: boolean; message?: string; resendEmailId?: string; sentTo?: string }> {
  const patient = await storage.getPatient(patientId);
  if (!patient) return { ok: false, message: "Patient not found" };
  const rawTo = (patient.portalAccessEmail || patient.email || "").trim();
  if (!rawTo) return { ok: false, message: "Add an email address before sending a reminder" };
  const to = normalizeRecipientEmail(rawTo);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, message: "RESEND_API_KEY is not configured" };

  const facility = patient.facilityId ? await storage.getFacility(patient.facilityId) : undefined;
  const facilityName = facility?.name ?? "Imani";
  const fromAddress = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
  const base = getPatientPortalBaseUrl();
  const loginUrl = `${base}/portal`;

  const qrDataUrl = await QRCode.toDataURL(loginUrl, { width: 240, margin: 2, errorCorrectionLevel: "M" });
  const html = `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p>Hello ${escapeHtml(patient.firstName)},</p>
  <p>This is a reminder from <strong>${escapeHtml(facilityName)}</strong> to access your patient portal.</p>
  <p>Sign in with your ${escapeHtml(facility?.patientIdentifierLabel || "MRN")} or email and the PIN you created.</p>
  <p style="margin: 1.5rem 0;">
    <a href="${escapeHtml(loginUrl)}" style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px;">Open patient portal</a>
  </p>
  <p><img src="${qrDataUrl}" alt="Portal login QR" width="240" height="240" style="display:block;border:0;" /></p>
  <p style="font-size: 13px; color: #666;">— ${escapeHtml(facilityName)}</p>
</body>
</html>`;

  const text = [
    `Hello ${patient.firstName},`,
    "",
    `This is a reminder from ${facilityName} to access your patient portal.`,
    `Sign in with your ${facility?.patientIdentifierLabel || "MRN"} or email and the PIN you created.`,
    "",
    loginUrl,
    "",
    `— ${facilityName}`,
  ].join("\n");

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: `${facilityName} <${fromAddress}>`,
    to,
    subject: `${facilityName} — Patient portal reminder`,
    html,
    text,
  });
  if (error) return { ok: false, message: resendErrorMessage(error.message) };
  const resendEmailId = data?.id;
  if (!resendEmailId) {
    console.warn("[patient portal] Resend reminder: no email id", { data });
    return { ok: false, message: "Email service returned an unexpected response" };
  }
  console.info("[patient portal] reminder email accepted by Resend", { resendEmailId, to, from: fromAddress });
  await storage.updatePatient(patientId, { portalInviteSentAt: new Date() });
  return { ok: true, resendEmailId, sentTo: to };
}

/**
 * Sends setup email (with invite link) if PIN not set; otherwise sends login reminder.
 * @param regenerateToken - New setup token when PIN not yet set (invalidates previous invite links).
 */
export async function issuePortalInviteAndSendEmail(
  patientId: string,
  options?: { regenerateToken?: boolean },
): Promise<{ ok: boolean; message?: string; resendEmailId?: string; sentTo?: string }> {
  let patient = await storage.getPatient(patientId);
  if (!patient) return { ok: false, message: "Patient not found" };
  /** Staff “send invitation” implies enabling portal; UI may not have saved the checkbox yet. */
  if (!patient.portalEnabled) {
    await storage.updatePatient(patientId, { portalEnabled: true });
    const reloaded = await storage.getPatient(patientId);
    if (!reloaded) return { ok: false, message: "Patient not found" };
    patient = reloaded;
  }

  const rawTo = (patient.portalAccessEmail || patient.email || "").trim();
  if (!rawTo) return { ok: false, message: "Add an email address (contact or portal) before sending an invitation" };
  const to = normalizeRecipientEmail(rawTo);

  if (patient.portalPinHash) {
    return sendPatientPortalLoginReminderEmail(patientId);
  }

  let token = patient.portalInviteToken?.trim();
  if (!token || options?.regenerateToken) {
    token = randomBytes(32).toString("hex");
  }

  await storage.updatePatient(patientId, { portalInviteToken: token });

  const facility = patient.facilityId ? await storage.getFacility(patient.facilityId) : undefined;
  const facilityName = facility?.name ?? "Imani";
  const fromAddress = process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
  const base = getPatientPortalBaseUrl();
  const portalUrl = `${base}/portal/invite/${encodeURIComponent(token)}`;

  const sent = await sendPatientPortalInviteEmail({
    toEmail: to,
    patientFirstName: patient.firstName,
    facilityName,
    senderDisplayName: facilityName,
    fromAddress,
    portalUrl,
  });

  if (!sent.ok) return { ok: false, message: sent.error };
  await storage.updatePatient(patientId, { portalInviteSentAt: new Date() });
  return { ok: true, resendEmailId: sent.resendEmailId, sentTo: to };
}
