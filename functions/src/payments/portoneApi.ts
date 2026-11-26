/**
 * 포트원 V2 REST — 결제 조회·취소. 시크릿은 호출하는 함수의 secrets 에 묶어 쓴다.
 * https://developers.portone.io/api/rest-v2
 */
const BASE = 'https://api.portone.io';

export type PortonePayment = {
  status: string; // READY | PENDING | VIRTUAL_ACCOUNT_ISSUED | PAID | FAILED | PARTIAL_CANCELLED | CANCELLED
  id: string;
  storeId?: string;
  transactionId?: string;
  currency?: string;
  paidAt?: string;
  amount?: { total?: number; paid?: number; cancelled?: number };
  method?: { type?: string };
};

export class PortoneApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly type: string,
    message: string
  ) {
    super(message);
    this.name = 'PortoneApiError';
  }
}

async function call<T>(secret: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `PortOne ${secret}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new PortoneApiError(
      res.status,
      String(body.type || 'UNKNOWN'),
      String(body.message || `PortOne ${res.status}`)
    );
  }
  return body as T;
}

/** 결제 없음(아직 결제창 전)이면 null */
export async function getPortonePayment(
  secret: string,
  paymentId: string
): Promise<PortonePayment | null> {
  try {
    return await call<PortonePayment>(secret, `/payments/${encodeURIComponent(paymentId)}`);
  } catch (err) {
    if (err instanceof PortoneApiError && (err.httpStatus === 404 || err.type === 'PAYMENT_NOT_FOUND')) {
      return null;
    }
    throw err;
  }
}

export type PortoneCancellation = {
  status?: string; // REQUESTED | SUCCEEDED | FAILED
  id?: string;
  totalAmount?: number;
};

/**
 * 결제 취소(환불). amount 를 비우면 전액.
 * currentCancellableAmount 로 이중 환불을 막는다(이미 일부 취소됐으면 포트원이 거절).
 */
export async function cancelPortonePayment(
  secret: string,
  paymentId: string,
  args: { amount?: number; reason: string; currentCancellableAmount?: number }
): Promise<PortoneCancellation> {
  const body: Record<string, unknown> = { reason: args.reason.slice(0, 100) };
  if (typeof args.amount === 'number') body.amount = Math.floor(args.amount);
  if (typeof args.currentCancellableAmount === 'number') {
    body.currentCancellableAmount = Math.floor(args.currentCancellableAmount);
  }
  const out = await call<{ cancellation?: PortoneCancellation }>(
    secret,
    `/payments/${encodeURIComponent(paymentId)}/cancel`,
    { method: 'POST', body: JSON.stringify(body) }
  );
  return out.cancellation || {};
}
