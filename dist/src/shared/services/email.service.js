import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
let transporter = null;
const getTransporter = () => {
    if (transporter)
        return transporter;
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
        try {
            transporter = nodemailer.createTransport({
                host: env.SMTP_HOST,
                port: env.SMTP_PORT,
                secure: env.SMTP_SECURE,
                auth: {
                    user: env.SMTP_USER,
                    pass: env.SMTP_PASS,
                },
            });
            return transporter;
        }
        catch (err) {
            console.error('[EmailService] Failed to initialize SMTP transporter:', err);
            return null;
        }
    }
    return null;
};
// Culinary-themed Heshel HTML Email Template Builder
const buildEmailHtml = (options) => {
    const { title, badge, greeting, instruction, otp, note } = options;
    return `
<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02); border: 1px solid #e2e8f0;" cellspacing="0" cellpadding="0">
          
          <!-- Top Accent Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #e02f21 0%, #b91c1c 100%); height: 6px;"></td>
          </tr>

          <!-- Header Section -->
          <tr>
            <td style="padding: 36px 36px 20px 36px; text-align: center;">
              <div style="display: inline-block; background-color: #fff1f2; border-radius: 12px; padding: 8px 16px; margin-bottom: 12px;">
                <span style="font-size: 22px; font-weight: 900; color: #e02f21; letter-spacing: -0.5px;">হেঁশেল</span>
                <span style="font-size: 14px; font-weight: 700; color: #64748b; margin-left: 6px;">• Heshel</span>
              </div>
              <h1 style="margin: 12px 0 4px 0; font-size: 22px; font-weight: 800; color: #0f172a; line-height: 1.3;">
                ${title}
              </h1>
              <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 500;">
                স্বাদ ও রান্নার মেলবন্ধন • Connect Through Cooking
              </p>
            </td>
          </tr>

          <!-- Content Section -->
          <tr>
            <td style="padding: 10px 36px 32px 36px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.6;">
                ${greeting}
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
                ${instruction}
              </p>

              <!-- OTP Code Display Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
                <tr>
                  <td align="center" style="background-color: #fef2f2; border: 2px dashed #fca5a5; border-radius: 16px; padding: 24px 16px;">
                    <div style="font-size: 11px; font-weight: 800; color: #b91c1c; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">
                      ${badge}
                    </div>
                    <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #e02f21; padding-left: 10px;">
                      ${otp}
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: #7f1d1d; margin-top: 8px;">
                      ⏱️ Valid for 10 minutes (১০ মিনিট মেয়াদ)
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Warning -->
              <div style="background-color: #f8fafc; border-left: 4px solid #cbd5e1; border-radius: 4px; padding: 12px 16px; margin: 24px 0 0 0;">
                <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                  🔒 <strong>নিরাপত্তা বার্তা / Security Notice:</strong> ${note}
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="padding: 24px 36px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #94a3b8; font-weight: 500;">
                যদি আপনি এই অনুরোধ না করে থাকেন, তবে নির্দ্বিধায় এই ইমেইলটি উপেক্ষা করুন।
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                © 2026 Heshel (হেঁশেল). All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};
export const EmailService = {
    /**
     * Send Email Verification OTP on signup or resend
     */
    async sendVerificationEmail(email, otp, userName) {
        const title = 'আপনার হেঁশেল একাউন্ট ভেরিফাই করুন';
        const html = buildEmailHtml({
            title,
            badge: 'Account Verification Code',
            greeting: userName ? `হ্যালো <strong>${userName}</strong>,` : 'হ্যালো সম্মানিত শেফ / ফুডি,',
            instruction: 'হেঁশেল (Heshel) কমিউনিটিতে স্বাগতম! আপনার ইমেইল ঠিকানাটি নিশ্চিত করতে নিচের ৬ ডিজিটের ভেরিফিকেশন কোডটি ব্যবহার করুন।',
            otp,
            note: 'এই কোডটি কারো সাথে শেয়ার করবেন না। হেঁশেল টিম কখনোই আপনার পাসওয়ার্ড বা ওটিপি জানতে চাইবে না।',
        });
        return EmailService.sendRawEmail({
            to: email,
            subject: `[Heshel] ${otp} হলো আপনার ভেরিফিকেশন কোড (Verification Code)`,
            html,
            logLabel: 'VERIFY EMAIL OTP',
            otp,
        });
    },
    /**
     * Send Password Reset OTP
     */
    async sendPasswordResetEmail(email, otp) {
        const title = 'পাসওয়ার্ড রিসেট ভেরিফিকেশন কোড';
        const html = buildEmailHtml({
            title,
            badge: 'Password Reset OTP',
            greeting: 'হ্যালো,',
            instruction: 'আপনার হেঁশেল একাউন্টের পাসওয়ার্ড রিসেট করার জন্য একটি অনুরোধ পাওয়া গেছে। পাসওয়ার্ড পরিবর্তন করতে নিচের ৬ ডিজিটের ওটিপি ব্যবহার করুন:',
            otp,
            note: 'আপনি যদি এই রিসেট অনুরোধ না করে থাকেন, তবে অবিলম্বে আপনার একাউন্ট সুরক্ষিত করুন।',
        });
        return EmailService.sendRawEmail({
            to: email,
            subject: `[Heshel] ${otp} হলো আপনার পাসওয়ার্ড রিসেট কোড (Password Reset OTP)`,
            html,
            logLabel: 'PASSWORD RESET OTP',
            otp,
        });
    },
    /**
     * Unified dispatcher for Better Auth emailOTP plugin
     */
    async sendOtpEmail(options) {
        const { email, otp, type } = options;
        if (type === 'forget-password') {
            return EmailService.sendPasswordResetEmail(email, otp);
        }
        return EmailService.sendVerificationEmail(email, otp);
    },
    /**
     * Raw delivery helper with SMTP fallback to development console log
     */
    async sendRawEmail(options) {
        const { to, subject, html, logLabel, otp } = options;
        const client = getTransporter();
        // Dev / Staging fallback logging to console
        console.log(`\n======================================================`);
        console.log(`✉️  [HESHEL EMAIL SERVICE] - ${logLabel}`);
        console.log(`   To       : ${to}`);
        console.log(`   Subject  : ${subject}`);
        console.log(`   OTP Code : >>> ${otp} <<<`);
        console.log(`   Expires  : 10 minutes`);
        if (!client) {
            console.log(`   Note     : SMTP credentials not set in .env. Console delivery mode active.`);
        }
        console.log(`======================================================\n`);
        if (!client) {
            // SMTP not configured yet, succeed gracefully so user is never blocked
            return true;
        }
        try {
            await client.sendMail({
                from: env.SMTP_FROM,
                to,
                subject,
                html,
            });
            return true;
        }
        catch (err) {
            console.error(`[EmailService Error] Failed to deliver email to ${to}:`, err.message);
            // Return true so user flow continues; error is logged
            return false;
        }
    },
};
export default EmailService;
