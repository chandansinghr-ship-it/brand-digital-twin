import { eq } from "drizzle-orm";
import {
  db,
  notificationsTable,
  userProfileTable,
  usersTable,
  type Notification,
  type NotificationKind,
} from "@workspace/db";
import { logger } from "./logger";
import { sendMail } from "./mail";

const EMAIL_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  "winback",
  "birthday",
  "anniversary",
  "loyalty_free_week",
  "loyalty_premium_unlock",
  "referral_redeemed",
]);

export function defaultChannelForKind(kind: NotificationKind): "email" | "in_app" {
  return EMAIL_KINDS.has(kind) ? "email" : "in_app";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderEmail(n: Notification, firstName: string | null): {
  subject: string;
  text: string;
  html: string;
} {
  const greet = firstName ? `Hi ${firstName},` : "Hi there,";
  const subject = n.title;
  const text = `${greet}\n\n${n.body}\n\nOpen the Tanmatra app to claim it.\n\n— Tanmatra\n\nTo stop these emails, update your notification preferences in the app.`;
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#fafaf7;padding:24px;color:#1f2937">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(n.title)}</h1>
    <p style="font-size:14px;line-height:1.55;margin:0 0 8px">${escapeHtml(greet)}</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${escapeHtml(n.body)}</p>
    <p style="font-size:14px;line-height:1.55;margin:0 0 24px">Open the Tanmatra app to claim it.</p>
    <p style="font-size:12px;color:#6b7280;margin:0">— Tanmatra</p>
  </div>
  <p style="max-width:520px;margin:12px auto 0;font-size:11px;color:#9ca3af;text-align:center">
    To stop these emails, update your notification preferences in the app.
  </p>
</body></html>`.trim();
  return { subject, text, html };
}

/**
 * Best-effort email dispatch for a freshly-created notification.
 * - Skips silently when channel is not "email".
 * - Skips when the user has no email on file or has opted out of this kind.
 * - On a successful send, marks status="sent" and stamps sentAt.
 * - On failure, downgrades channel to "in_app" so the row stays visible
 *   in the inbox and we don't keep retrying forever.
 */
export async function dispatchNotificationEmail(
  notification: Notification,
): Promise<void> {
  if (notification.channel !== "email") return;
  try {
    const [user] = await db
      .select({
        email: usersTable.email,
        firstName: usersTable.firstName,
      })
      .from(usersTable)
      .where(eq(usersTable.id, notification.userId));
    const [profile] = await db
      .select({ emailOptOut: userProfileTable.emailOptOut })
      .from(userProfileTable)
      .where(eq(userProfileTable.userId, notification.userId));

    const optedOut = Boolean(
      profile?.emailOptOut?.[notification.kind as NotificationKind],
    );
    if (!user?.email || optedOut) {
      // Fall back to in-app only.
      await db
        .update(notificationsTable)
        .set({
          channel: "in_app",
          status: "sent",
          sentAt: notification.sentAt ?? new Date(),
        })
        .where(eq(notificationsTable.id, notification.id));
      logger.info(
        {
          notificationId: notification.id,
          kind: notification.kind,
          reason: !user?.email ? "no_email" : "opted_out",
        },
        "notification.email.skipped",
      );
      return;
    }

    const { subject, text, html } = renderEmail(notification, user.firstName);
    const result = await sendMail({ to: user.email, subject, text, html });
    if (result.delivered) {
      await db
        .update(notificationsTable)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notificationsTable.id, notification.id));
      logger.info(
        { notificationId: notification.id, kind: notification.kind },
        "notification.email.sent",
      );
    } else {
      await db
        .update(notificationsTable)
        .set({
          channel: "in_app",
          status: "sent",
          sentAt: notification.sentAt ?? new Date(),
        })
        .where(eq(notificationsTable.id, notification.id));
      logger.warn(
        {
          notificationId: notification.id,
          kind: notification.kind,
          reason: result.reason,
        },
        "notification.email.failed_falling_back_to_in_app",
      );
    }
  } catch (err) {
    logger.error(
      { err: (err as Error).message, notificationId: notification.id },
      "notification.email.dispatch_error",
    );
    // Normalize the row so it doesn't sit in "pending" forever if the
    // dispatcher itself blew up (DB hiccup, transport bug, etc).
    try {
      await db
        .update(notificationsTable)
        .set({
          channel: "in_app",
          status: "sent",
          sentAt: notification.sentAt ?? new Date(),
        })
        .where(eq(notificationsTable.id, notification.id));
    } catch (innerErr) {
      logger.error(
        {
          err: (innerErr as Error).message,
          notificationId: notification.id,
        },
        "notification.email.dispatch_error_recovery_failed",
      );
    }
  }
}
