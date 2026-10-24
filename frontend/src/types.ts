export type BookStatus = "parsing" | "translating" | "done" | "partial" | "error";
export type BlockStatus = "pending" | "translating" | "done" | "error";

export interface Book {
  id: number;
  title: string;
  filename: string;
  page_count: number;
  status: BookStatus;
  error_msg: string | null;
  created_at: string;
  total: number;
  done: number;
  errors: number;
}

export interface Block {
  id: number;
  page: number;
  idx: number;
  text: string;
  /** [x0, y0, x1, y1] theo point, gốc trên-trái (cùng hệ với page.width/height). */
  bbox: [number, number, number, number];
  translation: string | null;
  status: BlockStatus;
  error_msg: string | null;
}

export interface PageData {
  page: { number: number; width: number; height: number };
  blocks: Block[];
}

export interface Progress {
  status: BookStatus;
  total: number;
  done: number;
  errors: number;
  error_msg: string | null;
}
