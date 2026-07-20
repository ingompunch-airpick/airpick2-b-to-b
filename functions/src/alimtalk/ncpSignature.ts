import * as nodeCrypto from 'crypto';

/** NCP API Gateway Signature v2 */
export function buildNcpApiSignature(
  method: string,
  urlPath: string,
  timestamp: string,
  accessKey: string,
  secretKey: string
): string {
  const message = `${method} ${urlPath}\n${timestamp}\n${accessKey}`;
  return nodeCrypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

export function buildNcpApiTimestamp(): string {
  return String(Date.now());
}
