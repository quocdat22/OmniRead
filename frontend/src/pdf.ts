// Dùng bản "legacy" của pdf.js: có polyfill cho các API JS mới (vd. Map.getOrInsertComputed)
// nên chạy được trên cả trình duyệt chưa cập nhật. Có thể đổi sang "pdfjs-dist" + "pdfjs-dist/build/..." nếu
// bạn chỉ dùng trình duyệt mới nhất.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
