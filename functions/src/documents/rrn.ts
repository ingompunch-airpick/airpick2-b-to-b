/**
 * OCR 글자 좌표에서 주민등록번호(외국인등록번호 포함)를 찾아 뒤 7자리를 가릴 상자를 만든다.
 * 손님에게는 서류 원본을 그대로 보여주되, 이 숫자만 가린다. (2026-11-27 대표 결정)
 *
 * 순수 함수 — Vision 응답 모양만 알고, 네트워크·이미지는 모른다.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** OCR 글자 하나 — 글자와 그 글자의 상자(픽셀) */
export interface OcrSymbol {
  text: string;
  box: Box;
  /** 이 글자 뒤에 띄어쓰기·줄바꿈이 있는지 */
  breakAfter?: 'space' | 'line';
}

interface Vertex {
  x?: number;
  y?: number;
}

interface VisionSymbol {
  text?: string;
  boundingBox?: { vertices?: Vertex[]; normalizedVertices?: Vertex[] };
  property?: { detectedBreak?: { type?: string } };
}

interface VisionPage {
  width?: number;
  height?: number;
  blocks?: Array<{
    paragraphs?: Array<{ words?: Array<{ symbols?: VisionSymbol[] }> }>;
  }>;
}

function boxFromVertices(vertices: Vertex[], scaleX = 1, scaleY = 1): Box | null {
  if (!vertices.length) return null;
  const xs = vertices.map((v) => (v.x ?? 0) * scaleX);
  const ys = vertices.map((v) => (v.y ?? 0) * scaleY);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  return { x, y, w, h };
}

/** Vision fullTextAnnotation 한 쪽 → 글자 목록 (읽는 순서) */
export function symbolsFromVisionPage(page: VisionPage): OcrSymbol[] {
  const out: OcrSymbol[] = [];
  const pw = Number(page.width) || 0;
  const ph = Number(page.height) || 0;
  for (const block of page.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const word of para.words || []) {
        for (const sym of word.symbols || []) {
          const text = String(sym.text || '');
          if (!text) continue;
          const bb = sym.boundingBox || {};
          const box =
            bb.vertices && bb.vertices.length
              ? boxFromVertices(bb.vertices)
              : bb.normalizedVertices && bb.normalizedVertices.length
                ? boxFromVertices(bb.normalizedVertices, pw, ph)
                : null;
          if (!box) continue;
          const t = sym.property?.detectedBreak?.type || '';
          const breakAfter =
            t === 'SPACE' || t === 'SURE_SPACE'
              ? 'space'
              : t === 'EOL_SURE_SPACE' || t === 'LINE_BREAK' || t === 'HYPHEN'
                ? 'line'
                : undefined;
          out.push({ text, box, ...(breakAfter ? { breakAfter } : {}) });
        }
      }
      // 문단이 끝나면 줄바꿈으로 본다
      if (out.length) out[out.length - 1].breakAfter = 'line';
    }
  }
  return out;
}

/** 전각 숫자·대시를 반각으로 */
function normalizeChar(c: string): string {
  const code = c.charCodeAt(0);
  if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xff10 + 48);
  if (c === '－' || c === '–' || c === '—' || c === '‐') return '-';
  return c;
}

function validBirth(yymmdd: string): boolean {
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

export interface RrnHit {
  /** 앞 6자리(생년월일) — 로그·화면에 그대로 둬도 되는 부분 */
  birth: string;
  /** 가릴 글자 상자 (뒤 7자리) */
  boxes: Box[];
}

/**
 * 글자 목록에서 주민등록번호를 찾는다.
 * 「900101-1234567」「9001011234567」「900101 1234567」 모양. 앞이 날짜가 아니면 건너뛴다.
 * 뒤 7자리 중 일부가 이미 「*」로 가려져 있으면 남은 숫자만 가린다.
 */
export function findRrns(symbols: OcrSymbol[]): RrnHit[] {
  // 글자를 이어 붙인 문자열과, 문자열 위치 → 글자 번호
  let text = '';
  const owner: number[] = [];
  symbols.forEach((s, i) => {
    for (const ch of s.text) {
      text += normalizeChar(ch);
      owner.push(i);
    }
    if (s.breakAfter) {
      text += s.breakAfter === 'line' ? '\n' : ' ';
      owner.push(-1);
    }
  });

  const hits: RrnHit[] = [];
  const re = /(?<![0-9])([0-9]{6})[ ]?-?[ ]?([1-8][0-9*]{6})(?![0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const birth = m[1];
    const back = m[2];
    if (!validBirth(birth)) continue;
    if (!/[0-9]{2,}/.test(back.slice(1))) continue; // 이미 거의 다 가려짐 (예: 1******)
    const backStart = m.index + m[0].length - back.length;
    const boxes: Box[] = [];
    for (let k = 0; k < back.length; k += 1) {
      const idx = owner[backStart + k];
      if (idx >= 0 && /[0-9]/.test(back[k])) boxes.push(symbols[idx].box);
    }
    if (boxes.length) hits.push({ birth, boxes });
  }
  return hits;
}

/** 가림 상자 — 글자 상자보다 조금 크게, 이미지 밖으로 나가지 않게 */
export function maskRects(hits: RrnHit[], width: number, height: number, pad = 3): Box[] {
  const rects: Box[] = [];
  for (const hit of hits) {
    for (const b of hit.boxes) {
      const x = Math.max(0, Math.floor(b.x - pad));
      const y = Math.max(0, Math.floor(b.y - pad));
      const r = Math.min(width, Math.ceil(b.x + b.w + pad));
      const btm = Math.min(height, Math.ceil(b.y + b.h + pad));
      if (r > x && btm > y) rects.push({ x, y, w: r - x, h: btm - y });
    }
  }
  return rects;
}

/** sharp composite 에 넣을 검은 상자 SVG */
export function maskSvg(rects: Box[], width: number, height: number): string {
  const body = rects
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#000"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
}
