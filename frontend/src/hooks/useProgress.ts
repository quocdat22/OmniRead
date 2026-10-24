import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Progress } from "../types";

/** Theo dõi tiến độ dịch qua SSE. Tự đóng khi job kết thúc; gọi restart() sau khi retry. */
export function useProgress(bookId: number): [Progress | null, () => void] {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const es = new EventSource(api.progressUrl(bookId));
    es.onmessage = (e) => {
      const p = JSON.parse(e.data) as Progress;
      setProgress(p);
      if (p.status !== "parsing" && p.status !== "translating") es.close();
    };
    es.addEventListener("gone", () => es.close());
    return () => es.close();
  }, [bookId, epoch]);

  const restart = useCallback(() => setEpoch((n) => n + 1), []);
  return [progress, restart];
}
