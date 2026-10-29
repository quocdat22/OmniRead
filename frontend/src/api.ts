import type { Book, PageData } from "./types";
import i18n from "./i18n";

export class ApiError extends Error {
  public code?: string;

  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    if (detail && typeof detail === "object" && "code" in detail) {
      this.code = (detail as { code: string }).code;
    }
  }

  get localizedMessage(): string {
    if (this.code && i18n.exists(`errors.${this.code}`)) {
      return i18n.t(`errors.${this.code}`);
    }
    return this.message;
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") || "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* body không phải JSON */
    }
    const code = (detail as { code?: string } | null)?.code;
    let msg =
      typeof detail === "string"
        ? detail
        : ((detail as { message?: string } | null)?.message ?? res.statusText);

    if (code && i18n.exists(`errors.${code}`)) {
      msg = i18n.t(`errors.${code}`);
    }
    throw new ApiError(res.status, msg, detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  health: () => request<{ ok: boolean; translator_configured: boolean }>("/health"),
  listBooks: () => request<Book[]>("/books"),
  getBook: (id: number) => request<Book>(`/books/${id}`),
  uploadBook: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<Book>("/books", { method: "POST", body: fd });
  },
  deleteBook: (id: number) => request<void>(`/books/${id}`, { method: "DELETE" }),
  retryBook: (id: number) => request<{ ok: boolean }>(`/books/${id}/retry`, { method: "POST" }),
  getBlocks: (id: number, page: number) => request<PageData>(`/books/${id}/blocks?page=${page}`),
  fileUrl: (id: number) => `${API_BASE}/books/${id}/file`,
  progressUrl: (id: number) => `${API_BASE}/books/${id}/progress`,
};
