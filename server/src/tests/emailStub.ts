import type { EmailMessage, EmailService } from "../services/email.js";

/** An EmailService for tests: records what would have been sent, or fails on demand. */
export class StubEmail implements EmailService {
  sent: EmailMessage[] = [];
  /** While set, every send rejects with this. */
  failWith: unknown = null;

  async send(message: EmailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }
}

/** What a refused connection looks like when it reaches us from Nodemailer, including the details we must never show. */
export const connectionRefused = () =>
  Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1025"), { code: "ESOCKET" });
