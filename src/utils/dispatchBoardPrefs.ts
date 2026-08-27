const STORAGE_KEY = 'dispatch_board_prefs';

/** 배차표 컬럼 id */
export const DISPATCH_COLUMN_IDS = [
  'index',
  'terminal',
  'terminalIn',
  'terminalOut',
  'airport',
  'lot',
  'carModel',
  'carNumber',
  'intake',
  'flightOut',
  'airlineOut',
  'exit',
  'flightIn',
  'airlineIn',
  'status',
  'unpaid',
  'destination',
  'userRequest',
  'adminMemo',
  'companyName',
  'bookingSource',
  'guestName',
  'phone',
] as const;

export type DispatchColumnId = (typeof DISPATCH_COLUMN_IDS)[number];

export const DISPATCH_FEATURE_IDS = [
  'telLink',
  'maskPhoneOnPrint',
  'csvVisibleOnly',
  'rowHighlight',
] as const;

export type DispatchFeatureId = (typeof DISPATCH_FEATURE_IDS)[number];

/** 목록 = 기존 표 / 시간표 = 시각 슬롯에 차량 배치 */
export type DispatchLayoutMode = 'list' | 'timetable';

export type DispatchBoardPrefs = {
  columns: Record<DispatchColumnId, boolean>;
  /** 표·CSV에 쓰는 컬럼 좌→우 순서 */
  columnOrder: DispatchColumnId[];
  features: Record<DispatchFeatureId, boolean>;
  layout: DispatchLayoutMode;
};

export const DISPATCH_COLUMN_META: {
  id: DispatchColumnId;
  label: string;
  defaultOn: boolean;
}[] = [
  { id: 'index', label: '순번', defaultOn: true },
  { id: 'terminal', label: '청사 (통합)', defaultOn: true },
  { id: 'terminalIn', label: '입고청사', defaultOn: false },
  { id: 'terminalOut', label: '출고청사', defaultOn: false },
  { id: 'airport', label: '공항', defaultOn: false },
  { id: 'lot', label: '주차장', defaultOn: true },
  { id: 'carModel', label: '차종', defaultOn: true },
  { id: 'carNumber', label: '차번', defaultOn: true },
  { id: 'intake', label: '입고', defaultOn: true },
  { id: 'flightOut', label: '출국편', defaultOn: true },
  { id: 'airlineOut', label: '출국항공사', defaultOn: false },
  { id: 'exit', label: '출고', defaultOn: true },
  { id: 'flightIn', label: '도착편', defaultOn: true },
  { id: 'airlineIn', label: '입국항공사', defaultOn: false },
  { id: 'status', label: '상태', defaultOn: false },
  { id: 'unpaid', label: '미납', defaultOn: false },
  { id: 'destination', label: '여행지', defaultOn: false },
  { id: 'userRequest', label: '고객요청', defaultOn: false },
  { id: 'adminMemo', label: '관리자메모', defaultOn: false },
  { id: 'companyName', label: '업체명', defaultOn: false },
  { id: 'bookingSource', label: '유입', defaultOn: false },
  { id: 'guestName', label: '예약자', defaultOn: true },
  { id: 'phone', label: '연락처', defaultOn: true },
];

export const DISPATCH_FEATURE_META: {
  id: DispatchFeatureId;
  label: string;
  defaultOn: boolean;
}[] = [
  { id: 'telLink', label: '연락처 탭하면 전화(tel:)', defaultOn: true },
  { id: 'maskPhoneOnPrint', label: '인쇄 시 연락처 마스킹', defaultOn: true },
  { id: 'csvVisibleOnly', label: 'CSV에 보이는 컬럼만 내보내기', defaultOn: true },
  { id: 'rowHighlight', label: '당일 입·출 행 색 강조', defaultOn: true },
];

const COLUMN_ID_SET = new Set<string>(DISPATCH_COLUMN_IDS);

/** 저장된 순서를 정규화: 유효 id만, 빠진 컬럼은 기본 순서 끝에 붙임 */
export function normalizeColumnOrder(order?: unknown): DispatchColumnId[] {
  const seen = new Set<DispatchColumnId>();
  const out: DispatchColumnId[] = [];
  if (Array.isArray(order)) {
    for (const raw of order) {
      if (typeof raw !== 'string' || !COLUMN_ID_SET.has(raw)) continue;
      const id = raw as DispatchColumnId;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DISPATCH_COLUMN_IDS) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

export function moveColumnInOrder(
  order: DispatchColumnId[],
  id: DispatchColumnId,
  direction: 'up' | 'down'
): DispatchColumnId[] {
  const next = normalizeColumnOrder(order);
  const i = next.indexOf(id);
  if (i < 0) return next;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= next.length) return next;
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
}

export function defaultDispatchBoardPrefs(): DispatchBoardPrefs {
  const columns = {} as Record<DispatchColumnId, boolean>;
  for (const c of DISPATCH_COLUMN_META) columns[c.id] = c.defaultOn;
  const features = {} as Record<DispatchFeatureId, boolean>;
  for (const f of DISPATCH_FEATURE_META) features[f.id] = f.defaultOn;
  return {
    columns,
    columnOrder: [...DISPATCH_COLUMN_IDS],
    features,
    layout: 'list',
  };
}

export function loadDispatchBoardPrefs(): DispatchBoardPrefs {
  const base = defaultDispatchBoardPrefs();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<DispatchBoardPrefs>;
    if (parsed.columns && typeof parsed.columns === 'object') {
      for (const id of DISPATCH_COLUMN_IDS) {
        if (typeof parsed.columns[id] === 'boolean') base.columns[id] = parsed.columns[id];
      }
    }
    base.columnOrder = normalizeColumnOrder(parsed.columnOrder);
    if (parsed.features && typeof parsed.features === 'object') {
      for (const id of DISPATCH_FEATURE_IDS) {
        if (typeof parsed.features[id] === 'boolean') base.features[id] = parsed.features[id];
      }
    }
    if (parsed.layout === 'list' || parsed.layout === 'timetable') {
      base.layout = parsed.layout;
    }
  } catch {
    // ignore corrupt prefs
  }
  return base;
}

export function saveDispatchBoardPrefs(prefs: DispatchBoardPrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...prefs,
        columnOrder: normalizeColumnOrder(prefs.columnOrder),
      })
    );
  } catch {
    // quota / private mode
  }
}

export function orderedDispatchColumns(prefs: DispatchBoardPrefs): DispatchColumnId[] {
  return normalizeColumnOrder(prefs.columnOrder);
}

export function visibleDispatchColumns(prefs: DispatchBoardPrefs): DispatchColumnId[] {
  return orderedDispatchColumns(prefs).filter((id) => prefs.columns[id]);
}
