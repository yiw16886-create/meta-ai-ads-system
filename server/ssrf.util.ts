import dns from 'dns';
import { promisify } from 'util';
import { URL } from 'url';
import net from 'net';

const lookupAsync = promisify(dns.lookup);

/**
 * 校验 URL 请求目标，防御 SSRF 攻击
 */
export async function isSafeUrl(targetUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(targetUrl);
    
    // 1. 严格限定协议仅支持 http 和 https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname;
    return await isSafeHost(hostname);
  } catch (err) {
    return false;
  }
}

/**
 * 直接校验 Hostname (常用于非 HTTP 的 TCP 测试，如 SMTP 连接)
 */
export async function isSafeHost(hostname: string): Promise<boolean> {
  try {
    if (!hostname) return false;

    // 域名/Host 黑名单
    const blockedHostnames = ['localhost', 'metadata.google.internal', '169.254.169.254'];
    if (blockedHostnames.includes(hostname.toLowerCase())) {
      return false;
    }

    let ips: string[] = [];

    if (net.isIP(hostname)) {
      ips = [hostname];
    } else {
      try {
        // 使用 lookup 包含 IPv4 和 IPv6 的所有解析记录
        const addresses = await lookupAsync(hostname, { all: true });
        ips = addresses.map(a => a.address);
      } catch (err) {
        return false;
      }
    }

    if (ips.length === 0) return false;

    for (const ip of ips) {
      if (isPrivateIP(ip)) {
        return false;
      }
    }

    return true;
  } catch (err) {
    return false;
  }
}

function isPrivateIP(ip: string): boolean {
  let normalizeIp = ip.toLowerCase();

  // 处理 IPv4-mapped IPv6 地址 (如 ::ffff:127.0.0.1)
  if (normalizeIp.startsWith('::ffff:')) {
    normalizeIp = normalizeIp.replace('::ffff:', '');
  }

  // IPv6 本地/私有网段拦截
  if (!net.isIPv4(normalizeIp)) {
    if (
      normalizeIp === '::1' || 
      normalizeIp === '::' ||
      normalizeIp.startsWith('fc') || 
      normalizeIp.startsWith('fd') ||
      normalizeIp.startsWith('fe80')
    ) {
      return true;
    }
  }

  // IPv4 网段校验
  const parts = normalizeIp.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return false;

  if (parts[0] === 127) return true; // 回环地址
  if (parts[0] === 10) return true; // A类私有网络
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // B类私有网络
  if (parts[0] === 192 && parts[1] === 168) return true; // C类私有网络
  if (parts[0] === 169 && parts[1] === 254) return true; // 云元数据 (AWS/GCP)
  if (parts[0] === 0) return true; // 本地网络

  return false;
}
