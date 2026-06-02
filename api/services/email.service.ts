import nodemailer from "nodemailer";
import prisma from "../db.js";

async function getSmtpConfig() {
  const settings = await prisma.setting.findMany();
  
  const configMap = settings.reduce((acc: any, cur) => {
    acc[cur.key] = cur.value;
    return acc;
  }, {});

  if (!configMap.SMTP_HOST || !configMap.SMTP_PORT || !configMap.SMTP_USER || !configMap.SMTP_PASS) {
    return null; 
  }

  return {
    host: configMap.SMTP_HOST,
    port: parseInt(configMap.SMTP_PORT, 10),
    secure: configMap.SMTP_SECURE === "true",
    auth: {
      user: configMap.SMTP_USER,
      pass: configMap.SMTP_PASS
    },
    from: configMap.SMTP_FROM || configMap.SMTP_USER
  };
}

export async function sendInvitationEmail(email: string, token: string, role: string, baseUrlInput?: string) {
  const config = await getSmtpConfig();
  if (!config) {
    console.warn("SMTP settings not configured, skipping email send. Token:", token);
    return { success: false, error: "SMTP settings not configured" };
  }
  
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });
  
  const baseUrl = baseUrlInput || process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!baseUrl) {
    console.error("❌ No baseUrl found for invitation emails!");
  }
  const registerUrl = `${baseUrl.replace(/\/$/, '')}/?token=${token}`;
  
  const html = `
    <div style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background-color: #2563eb; padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 800;">Meta Insights Pro</h1>
        <p style="color: rgba(255,255,255,0.8); margin-top: 8px; font-size: 14px;">您的 Meta 广告分析专家</p>
      </div>
      <div style="padding: 40px; background-color: white;">
        <h2 style="font-size: 20px; color: #1e293b; margin-top: 0; margin-bottom: 16px;">加入团队邀请</h2>
        <p style="font-size: 16px; color: #475569; line-height: 1.8;">您好！</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.8;">管理员邀请您加入 <strong>Meta Insights Pro</strong> 仪表板，您的角色为：<span style="color: #2563eb; font-weight: bold;">${role === 'admin' ? '管理员' : '成员'}</span>。</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.8;">请点击下方按钮进入激活页面，设置您的登录密码：</p>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${registerUrl}" style="background-color: #2563eb; color: white; padding: 14px 48px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);">激活账户</a>
        </div>
        
        <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin-top: 32px;">
          <p style="font-size: 13px; color: #64748b; margin: 0;"><strong>安全提示：</strong></p>
          <ul style="font-size: 13px; color: #64748b; margin: 8px 0 0 0; padding-left: 20px;">
            <li>此链接将在 24 小时后失效</li>
            <li>如果按钮无法跳转，请手动复制以下地址到浏览器：</li>
            <li style="word-break: break-all; margin-top: 6px;">${registerUrl}</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  try {
    console.log(`[Server] 📨 Attempting to send invitation email to: ${email}`);
    const info = await transporter.sendMail({
      from: `"Meta Insights Pro" <${config.from}>`,
      to: email,
      subject: "邀请您加入 Meta Insights Pro",
      html
    });
    console.log(`[Server] ✅ Email sent successfully. MessageId: ${info.messageId}`);
    return { success: true };
  } catch (err: any) {
    console.error("Email sending failed:", err);
    let errorRecommend = "";
    if (err.message.includes("EENVELOPE")) {
       errorRecommend = "服务器阻止了发件地址。请检查SMTP发送地址配置。";
    }
    return { success: false, error: err.message, recommendation: errorRecommend };
  }
}
