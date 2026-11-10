import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

export type EmailMessage = { to: string; subject: string; text: string; html: string };

/**
 * ALT-3. Everything that sends mail depends on this interface, never on Nodemailer directly, so a test can
 * hand in a stub and a later phase can swap the provider without touching the dispatcher.
 */
export interface EmailService {
  /** Resolves when the mail server accepted the message. Rejects otherwise. */
  send(message: EmailMessage): Promise<void>;
}

/** The one real implementation: plain SMTP through Nodemailer (Mailpit locally, any provider in production). */
export class SmtpEmailService implements EmailService {
  private transporter: Transporter | null = null;

  /** Created on first use, so importing this file never opens a connection. */
  private get transport(): Transporter {
    this.transporter ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // implicit TLS on 465; other ports upgrade with STARTTLS when the server offers it
      auth:
        env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

let current: EmailService | null = null;

export function getEmailService(): EmailService {
  current ??= new SmtpEmailService();
  return current;
}

/** Tests swap in a stub; pass null to go back to SMTP. */
export function setEmailService(service: EmailService | null): void {
  current = service;
}

/**
 * A short sentence that is safe to store and to show a person. The raw error (host names, ports, server
 * banners) goes to the log only. The wording is the same whatever the provider says.
 */
export function describeSendError(err: unknown): string {
  const e = err as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const responseCode = typeof e?.responseCode === "number" ? e.responseCode : 0;

  if (code === "EAUTH") return "The mail server rejected our login.";
  if (responseCode >= 500) return "The mail server refused the message.";
  if (responseCode >= 400) return "The mail server could not take the message right now.";
  if (
    [
      "ECONNECTION",
      "ESOCKET",
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOTFOUND",
      "EDNS",
      "EHOSTUNREACH",
    ].includes(code)
  ) {
    return "Could not reach the mail server.";
  }
  return "The email could not be sent.";
}
