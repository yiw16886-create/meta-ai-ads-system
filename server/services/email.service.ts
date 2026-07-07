import nodemailer from "nodemailer";
import prisma from "../../db/index.js";

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
    secure: configMap.SMTP_SECURE ? configMap.SMTP_SECURE === "true" : parseInt(configMap.SMTP_PORT, 10) === 465,
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
    auth: config.auth,
    tls: {
      rejectUnauthorized: false
    }
  });
  
  const baseUrl = baseUrlInput || process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!baseUrl) {
    console.error("❌ No baseUrl found for invitation emails!");
  }
  
  // Normalize the role variable to prevent undefined crashes and handle any casing.
  const normalizedRole = String(role || 'member').toLowerCase();
  
  // Format the activation URLs safely. We support both root queries and direct paths.
  // 必须严格使用我们自己的 Vercel 项目域名
  const registerUrl = `https://1-eight-azure.vercel.app/accept-invite?token=${token}`;
  
  const html = `
    <div style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="background-color: #2563eb; padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 800;">Meta Insights Pro</h1>
        <p style="color: rgba(255,255,255,0.8); margin-top: 8px; font-size: 14px;">您的 Meta 广告分析专家</p>
      </div>
      <div style="padding: 40px; background-color: white;">
        <h2 style="font-size: 20px; color: #1e293b; margin-top: 0; margin-bottom: 16px;">加入团队邀请</h2>
        <p style="font-size: 16px; color: #475569; line-height: 1.8;">您好！</p>
        <p style="font-size: 16px; color: #475569; line-height: 1.8;">管理员邀请您加入 <strong>Meta Insights Pro</strong> 仪表板，您的角色为：<span style="color: #2563eb; font-weight: bold;">${normalizedRole === 'admin' ? '管理员' : '成员'}</span>。</p>
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

export async function testSmtpConnection(
  host: string,
  port: number,
  user: string,
  pass: string,
  from: string,
  targetEmail: string
) {
  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
      <h2 style="color: #2563eb;">SMTP 测试连接成功</h2>
      <p>恭喜！您的 SMTP 邮件服务配置测试成功，系统可以正常发送系统邮件了。</p>
      <p style="font-size: 12px; color: #64748b; margin-top: 24px;">这是一封自动发送的 SMTP 配置测试邮件。</p>
    </div>
  `;

  try {
    await transporter.verify();
    console.log("[SMTP Test] Verification passed. Attempting to send a test email...");
    
    const fromAddress = from || user;
    const info = await transporter.sendMail({
      from: `"Meta Insights Pro" <${fromAddress}>`,
      to: targetEmail,
      subject: "SMTP 邮件服务连接测试",
      html
    });
    
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error("[SMTP Test] Connection / Send failed:", err);
    return { success: false, error: err.message };
  }
}

