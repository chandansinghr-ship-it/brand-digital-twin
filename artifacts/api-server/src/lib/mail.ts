import { logger } from "./logger";
import nodemailer, { type Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailResult {
  delivered: boolean;
  reason?: string;
}

let cachedTransport: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (cachedTransport !== undefined) return cachedTransport;
  const url = process.env["SMTP_URL"];
  if (!url) {
    cachedTransport = null;
    return null;
  }
  try {
    cachedTransport = nodemailer.createTransport(url);
    return cachedTransport;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "mail.transport_init_failed",
    );
    cachedTransport = null;
    return null;
  }
}

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const from = process.env["MAIL_FROM"] ?? "ops@tanmatra.local";
  const transport = getTransport();
  if (!transport) {
    logger.info(
      { to: msg.to, subject: msg.subject },
      "mail.no_transport_logging_only",
    );
    return { delivered: false, reason: "no SMTP_URL configured" };
  }
  try {
    await transport.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return { delivered: true };
  } catch (err) {
    logger.error(
      { err: (err as Error).message, to: msg.to },
      "mail.send_failed",
    );
    return { delivered: false, reason: (err as Error).message };
  }
}
