/**
 * 동시 2건 예약 → capacity=1 이면 1건만 성공.
 * Firestore 트랜잭션과 동일한 “읽기 → 조건 → 쓰기, 충돌 시 재시도” 모델을 메모리로 검증.
 *
 * 실행: npx --prefix functions tsx src/parkingSlotCapacity.concurrent.test.ts
 * 또는: npm --prefix functions run test:parking-slots
 */
import { SOLD_OUT, tryClaimBooked } from './parkingSlotCapacity';

type SlotDoc = { booked: number; capacity: number; version: number };

class MemorySlotStore {
  private docs = new Map<string, SlotDoc>();

  constructor(private readonly capacity: number) {}

  getSnapshot(id: string): SlotDoc {
    const cur = this.docs.get(id);
    return cur
      ? { ...cur }
      : { booked: 0, capacity: this.capacity, version: 0 };
  }

  /**
   * 낙관적 잠금 트랜잭션. 두 요청이 동시에 들어오면 한 쪽만 커밋되고
   * 다른 쪽은 재시도 후 SOLD_OUT.
   */
  async runClaim(id: string): Promise<'ok' | typeof SOLD_OUT> {
    for (let attempt = 0; attempt < 32; attempt++) {
      const read = this.getSnapshot(id);
      const nextBooked = tryClaimBooked(read.booked, read.capacity);
      if (nextBooked === SOLD_OUT) return SOLD_OUT;

      // 실제 네트워크/스케줄링 경쟁 흉내
      await new Promise((r) => setImmediate(r));

      const latest = this.docs.get(id);
      const latestVersion = latest?.version ?? 0;
      if (latestVersion !== read.version) {
        continue; // 충돌 → 재시도
      }

      this.docs.set(id, {
        booked: nextBooked,
        capacity: read.capacity,
        version: read.version + 1,
      });
      return 'ok';
    }
    return SOLD_OUT;
  }

  booked(id: string): number {
    return this.docs.get(id)?.booked ?? 0;
  }
}

async function main(): Promise<void> {
  const store = new MemorySlotStore(1);
  const slotId = 'partner_test__2099-01-01__indoor';

  const [a, b] = await Promise.all([store.runClaim(slotId), store.runClaim(slotId)]);

  const oks = [a, b].filter((r) => r === 'ok').length;
  const sold = [a, b].filter((r) => r === SOLD_OUT).length;

  if (oks !== 1 || sold !== 1) {
    console.error('FAIL concurrent claim', { a, b, booked: store.booked(slotId) });
    process.exit(1);
  }
  if (store.booked(slotId) !== 1) {
    console.error('FAIL booked count', store.booked(slotId));
    process.exit(1);
  }

  // 세 번째도 만차
  const c = await store.runClaim(slotId);
  if (c !== SOLD_OUT) {
    console.error('FAIL third claim should be SOLD_OUT', c);
    process.exit(1);
  }

  console.log('PASS concurrent parking slot claim: 2 parallel → 1 ok + 1 SOLD_OUT');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
