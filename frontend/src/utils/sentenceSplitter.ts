/**
 * Tách một đoạn văn bản (có thể chứa thẻ HTML nội dòng như <b>, <i>, <font>)
 * thành mảng các câu hoàn chỉnh, đồng thời đảm bảo các thẻ HTML được đóng/mở cân bằng
 * ở mỗi câu.
 */
export function splitSentencesHtml(text: string): string[] {
  if (!text) return [];

  // Tách câu theo các dấu kết thúc (. ! ? …) có khoảng trắng theo sau
  const splits = text.split(/([.!?…]+["'”’\)\]]*\s+)/);
  const rawSentences: string[] = [];
  let current = "";

  for (let i = 0; i < splits.length; i += 2) {
    const part = splits[i];
    const delim = splits[i + 1] || "";
    current += part + delim;

    // Lọc bỏ thẻ HTML để kiểm tra từ cuối
    const clean = current.replace(/<[^>]+>/g, "").trim();
    const words = clean.split(/\s+/);
    if (words.length > 0) {
      const lastWord = words[words.length - 1]
        .toLowerCase()
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

      // Các từ viết tắt phổ biến không ngắt câu
      const abbrs = [
        "tp", "ts", "th", "dr", "mr", "ms", "mrs", "prof", "sr", "jr",
        "eg", "e.g", "ie", "i.e", "vs", "etc", "fig", "al", "tr", "approx",
      ];
      if (abbrs.includes(lastWord)) {
        continue;
      }
      // Chữ cái đơn (tên viết tắt như J. K. Rowling)
      if (lastWord.length === 1 && /^[a-zA-Z]$/.test(lastWord)) {
        continue;
      }
      // Từ tiếp theo bắt đầu bằng chữ thường và không phải kết thúc bằng ! hoặc ?
      if (
        i + 2 < splits.length &&
        /^[a-zà-ỹ]/.test(splits[i + 2].trim()) &&
        !/[!?]/.test(delim)
      ) {
        continue;
      }
    }

    if (current.trim()) {
      rawSentences.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) {
    rawSentences.push(current.trim());
  }

  if (rawSentences.length <= 1) {
    return [text.trim()];
  }

  // Cân bằng các thẻ HTML giữa các câu (đóng thẻ ở câu trước, mở lại ở câu sau)
  const result: string[] = [];
  let activeTags: { name: string; fullTag: string }[] = [];

  for (const raw of rawSentences) {
    const prefix = activeTags.map((t) => t.fullTag).join("");
    const s = prefix + raw;

    const tagRegex = /<\/?([a-zA-Z0-9]+)(?:\s+[^>]*?)?>/g;
    let match: RegExpExecArray | null;
    const currentStack = [...activeTags];

    while ((match = tagRegex.exec(s)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();

      if (fullTag.startsWith("</")) {
        const idx = currentStack.map((t) => t.name).lastIndexOf(tagName);
        if (idx !== -1) {
          currentStack.splice(idx, 1);
        }
      } else if (!fullTag.endsWith("/>") && tagName !== "br" && tagName !== "img") {
        currentStack.push({ name: tagName, fullTag });
      }
    }

    let suffix = "";
    for (let j = currentStack.length - 1; j >= 0; j--) {
      suffix += `</${currentStack[j].name}>`;
    }

    result.push(s + suffix);
    activeTags = currentStack;
  }

  return result.length > 0 ? result : [text.trim()];
}
