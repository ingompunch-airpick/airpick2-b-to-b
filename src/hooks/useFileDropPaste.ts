import { useEffect, useRef, useState, type DragEvent } from 'react';

/**
 * 서류 넣기 — 끌어다 놓기 · 붙여넣기(⌘V / Ctrl+V).
 * 사진과 PDF만 받는다. 붙여넣기는 이 화면이 열려 있는 동안 창 전체에서 받는다(입력칸에 글자를 붙일 때는 제외).
 */
export function useFileDropPaste(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  const accept = (list: FileList | File[] | null | undefined): File[] =>
    Array.from(list || []).filter(
      (f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    );

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const files = accept(e.clipboardData?.files);
      if (!files.length || (typing && !e.clipboardData?.files.length)) return;
      e.preventDefault();
      onFilesRef.current(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [enabled]);

  const dropProps = {
    onDragEnter: (e: DragEvent) => {
      if (!enabled || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!enabled || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = accept(e.dataTransfer.files);
      if (files.length) onFilesRef.current(files);
    },
  };

  return { dragging, dropProps };
}
