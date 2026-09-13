"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaAssetDTO } from "@/lib/media/types";

export interface UploadItem {
  id: string;
  file: File;
  progress: number; // 0..1
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
  asset?: MediaAssetDTO;
}

/** XHR uploads with per-file progress, 3 in parallel. Options are sent as form fields. */
export function useUploader(onDone: (asset: MediaAssetDTO, item: UploadItem) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(0);
  const queue = useRef<{ item: UploadItem; fields: Record<string, string> }[]>([]);
  const pumpRef = useRef<() => void>(() => {});

  const patch = (id: string, p: Partial<UploadItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const pump = useCallback(() => {
    while (running.current < 3 && queue.current.length) {
      const { item, fields } = queue.current.shift()!;
      running.current++;
      patch(item.id, { status: "uploading" });
      const fd = new FormData();
      fd.append("file", item.file);
      Object.entries(fields).forEach(([k, v]) => v && fd.append(k, v));
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/media/upload");
      xhr.upload.onprogress = (e) => e.lengthComputable && patch(item.id, { progress: e.loaded / e.total });
      xhr.onload = () => {
        running.current--;
        try {
          const j = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            patch(item.id, { status: "done", progress: 1, asset: j });
            onDone(j, item);
          } else patch(item.id, { status: "error", error: j.error ?? `HTTP ${xhr.status}` });
        } catch {
          patch(item.id, { status: "error", error: `HTTP ${xhr.status}` });
        }
        pumpRef.current();
      };
      xhr.onerror = () => {
        running.current--;
        patch(item.id, { status: "error", error: "Σφάλμα δικτύου" });
        pumpRef.current();
      };
      xhr.send(fd);
    }
  }, [onDone]);
  useEffect(() => { pumpRef.current = pump; }, [pump]);

  const add = useCallback(
    (files: File[] | FileList, fields: Record<string, string> = {}) => {
      const list = Array.from(files).map((file) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, progress: 0, status: "queued" as const }));
      setItems((xs) => [...list, ...xs]);
      list.forEach((item) => queue.current.push({ item, fields }));
      pump();
    },
    [pump],
  );

  const clearDone = useCallback(() => setItems((xs) => xs.filter((x) => x.status !== "done")), []);
  return { items, add, clearDone };
}
