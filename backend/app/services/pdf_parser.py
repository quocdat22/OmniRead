"""Trích xuất "block" (đoạn văn) từ PDF text-based bằng PyMuPDF.

Quy trình:
  1. Lấy các dòng (line) + cỡ chữ + bbox của từng trang.
  2. Loại header/footer (dòng lặp lại ở lề trên/dưới nhiều trang) và số trang.
  3. Gom các dòng thành đoạn văn bằng heuristic: cỡ chữ, khoảng cách dòng,
     thụt đầu dòng, dấu câu cuối dòng, ký hiệu bullet.
  4. Nối dòng + xử lý gạch nối cuối dòng ("exam-" + "ple" -> "example").
  5. Liên kết đoạn văn bị ngắt qua trang (_link_page_continuations).

Tọa độ bbox: đơn vị point, gốc ở góc TRÊN-TRÁI, theo hệ tọa độ của page.rect.
Frontend nhân với (canvasWidth / page.width) để định vị overlay.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

from app.config import settings


class PdfParseError(Exception):
    def __init__(self, message: str, code: str = "PDF_PARSE_ERROR"):
        super().__init__(message)
        self.code = code


class NoTextLayerError(PdfParseError):
    def __init__(self, message: str = "PDF does not have a text layer"):
        super().__init__(message, code="PDF_NO_TEXT_LAYER")


@dataclass
class ParsedPage:
    number: int  # 1-based
    width: float
    height: float


@dataclass
class ParsedBlock:
    page: int  # 1-based
    idx: int  # thứ tự trong trang
    text: str
    bbox: tuple[float, float, float, float]
    group_key: int = 0  # Mã nhóm tạm thời khi parse
    part_no: int = 0    # Thứ tự mảnh trong nhóm (0, 1, ...)
    font_size: float = 0.0  # Cỡ chữ (point)
    sentences: list[dict] = field(default_factory=list)


@dataclass
class ParsedDocument:
    title: str | None
    pages: list[ParsedPage]
    blocks: list[ParsedBlock]


@dataclass
class _SpanInfo:
    text: str
    size: float
    font: str
    flags: int
    color: int  # 24-bit sRGB
    weight: int = 400
    italic: bool = False


@dataclass
class _Line:
    x0: float
    y0: float
    x1: float
    y1: float
    size: float
    text: str
    block_no: int
    spans: list[_SpanInfo]


@dataclass
class _RawBlock:
    no: int
    bbox: tuple[float, float, float, float]
    text: str
    lines: list[_Line]


# ---------------------------------------------------------------- hằng số / regex
_CLEAN = str.maketrans(
    {
        "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
        "\u00ad": None,  # soft hyphen
        "\u00a0": " ",
    }
)
_ENDS_SENTENCE = re.compile(r"""[.!?…:;"”’')\]]\s*$""")
_BULLET = re.compile(r"^\s*(?:[•●▪■◦‣*–—]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s+")
_PAGE_NO = re.compile(r"^(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:of|/)\s*\d{1,4})?$", re.I)


# ---------------------------------------------------------------- bước 1: lấy dòng
def _font_weight(flags: int, font: str) -> int:
    f = font.lower()
    if "black" in f or "heavy" in f:
        return 900
    if "extrabold" in f or "ultrabold" in f:
        return 800
    if bool(flags & 16) or "bold" in f:
        return 700
    if "semibold" in f or "demibold" in f or "demi" in f:
        return 600
    if "medium" in f:
        return 500
    if "light" in f:
        return 300
    if "thin" in f or "hairline" in f:
        return 200
    return 400


def _is_italic(flags: int, font: str) -> bool:
    f = font.lower()
    return bool(flags & 2) or ("italic" in f) or ("oblique" in f)


def _is_neutral_dark(c: int) -> bool:
    r = (c >> 16) & 0xFF
    g = (c >> 8) & 0xFF
    b = c & 0xFF
    if max(r, g, b) - min(r, g, b) > 25:
        return False
    return max(r, g, b) < 65


def _hex_color(c: int) -> str:
    return f"#{c:06x}"


def _extract_blocks(page: pymupdf.Page) -> list[_RawBlock]:
    data = page.get_text("dict", sort=settings.sort_blocks)
    out: list[_RawBlock] = []
    for bno, b in enumerate(data["blocks"]):
        if b.get("type") != 0:  # bỏ block ảnh
            continue
        lines: list[_Line] = []
        for ln in b.get("lines", []):
            dx, _dy = ln.get("dir", (1.0, 0.0))
            if abs(dx) < 0.95:  # bỏ chữ xoay/dọc (watermark, nhãn bên lề)
                continue
            spans = [s for s in ln["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in ln["spans"]).translate(_CLEAN)
            text = re.sub(r"\s+", " ", text).strip()
            if not text:
                continue
            span_infos = [
                _SpanInfo(
                    text=s["text"].translate(_CLEAN),
                    size=float(s.get("size", 0.0)),
                    font=str(s.get("font", "")),
                    flags=int(s.get("flags", 0)),
                    color=int(s.get("color", 0)),
                    weight=_font_weight(int(s.get("flags", 0)), str(s.get("font", ""))),
                    italic=_is_italic(int(s.get("flags", 0)), str(s.get("font", ""))),
                )
                for s in ln["spans"]
                if s["text"].translate(_CLEAN)
            ]
            x0, y0, x1, y1 = ln["bbox"]
            rep_span = max(spans, key=lambda s: len(s["text"].strip()))
            lines.append(_Line(x0, y0, x1, y1, float(rep_span["size"]), text, bno, span_infos))
        if lines:
            bbox = (
                min(l.x0 for l in lines), min(l.y0 for l in lines),
                max(l.x1 for l in lines), max(l.y1 for l in lines),
            )
            out.append(_RawBlock(bno, bbox, " ".join(l.text for l in lines), lines))
    return out


# ---------------------------------------------------------------- bước 2: header/footer
def _in_margin(b: _RawBlock, page_h: float) -> bool:
    r = settings.margin_ratio
    return b.bbox[3] < page_h * r or b.bbox[1] > page_h * (1 - r)


def _signature(text: str) -> str:
    return re.sub(r"\d+", "#", text.lower()).strip()


def _repeated_margin_signatures(
    raw_per_page: list[list[_RawBlock]], pages: list[ParsedPage]
) -> set[str]:
    counter: Counter[str] = Counter()
    for raws, pg in zip(raw_per_page, pages):
        counter.update({_signature(b.text) for b in raws if _in_margin(b, pg.height)})
    threshold = max(2, int(len(pages) * 0.3)) if len(pages) >= 2 else 1
    return {sig for sig, c in counter.items() if sig and c >= threshold}


def _is_noise(b: _RawBlock, page_h: float, repeated: set[str]) -> bool:
    if not _in_margin(b, page_h):
        return False
    return bool(_PAGE_NO.match(b.text.strip())) or _signature(b.text) in repeated


# ---------------------------------------------------------------- bước 3: gom đoạn
def _starts_new_paragraph(prev: _Line, cur: _Line, base_x0: float) -> bool:
    size = max(prev.size, cur.size)
    if abs(prev.size - cur.size) > 0.8:  # tiêu đề <-> nội dung
        return True
    gap = cur.y0 - prev.y1
    if gap < -0.5 * size or gap > 0.5 * size:  # nhảy cột / cách đoạn
        return True
    if _BULLET.match(cur.text):
        return True

    ends = bool(_ENDS_SENTENCE.search(prev.text))
    if cur.block_no != prev.block_no:
        # Hai block khác nhau: chỉ nối khi câu rõ ràng chưa kết thúc.
        return ends or not (cur.text[:1].islower() or prev.text.endswith((",", "-")))
    # Cùng block: tách nếu dòng trước kết thúc câu và dòng này thụt vào.
    return ends and (cur.x0 - base_x0 > 0.8 * size)


def _group_paragraphs(lines: list[_Line]) -> list[list[_Line]]:
    groups: list[list[_Line]] = []
    cur: list[_Line] = []
    for ln in lines:
        if cur and _starts_new_paragraph(cur[-1], ln, min(l.x0 for l in cur)):
            groups.append(cur)
            cur = []
        cur.append(ln)
    if cur:
        groups.append(cur)
    return groups


# ---------------------------------------------------------------- bước 4: nối dòng & định dạng
@dataclass
class _FormattedToken:
    text: str
    bold: bool
    italic: bool
    color: str | None


def _format_paragraph(lines: list[_Line]) -> str:
    all_spans: list[_SpanInfo] = []
    for ln in lines:
        line_spans = [
            _SpanInfo(
                s.text,
                s.size,
                s.font,
                s.flags,
                s.color,
                s.weight,
                s.italic,
            )
            for s in ln.spans
            if s.text
        ]
        if not line_spans:
            continue
        if all_spans:
            last = all_spans[-1]
            first = line_spans[0]
            last_t = last.text
            first_t = first.text
            # Nối từ có dấu gạch nối cuối dòng: "engineer-" + "ing" -> "engineering"
            if (
                (last_t.endswith("-") or last_t.endswith("‐"))
                and len(last_t) > 1
                and last_t[-2].isalpha()
                and first_t[:1].islower()
            ):
                last.text = last_t[:-1]
            elif not last_t.endswith(" ") and not first_t.startswith(" "):
                all_spans.append(_SpanInfo(" ", last.size, "", 0, 0, 400, False))
        all_spans.extend(line_spans)

    if not all_spans:
        return ""

    # Tính baseline cho cả đoạn văn
    total_chars = 0
    weights: Counter[int] = Counter()
    italic_chars = 0

    for s in all_spans:
        core_len = len(s.text.strip())
        if core_len == 0:
            continue
        total_chars += core_len
        weights[s.weight] += core_len
        if s.italic:
            italic_chars += core_len

    if total_chars == 0:
        return ""

    baseline_weight = weights.most_common(1)[0][0] if weights else 400
    baseline_italic = (italic_chars / total_chars > 0.6)

    # Gán active tags cho từng span
    tokens: list[_FormattedToken] = []
    for s in all_spans:
        if baseline_weight >= 600:
            active_bold = True
        else:
            active_bold = (s.weight >= 600) or (s.weight >= 500 and s.weight > baseline_weight)

        active_italic = s.italic if not baseline_italic else True
        active_color = _hex_color(s.color) if not _is_neutral_dark(s.color) else None

        tokens.append(_FormattedToken(s.text, active_bold, active_italic, active_color))

    # Hợp nhất khoảng trắng nằm giữa 2 token có cùng định dạng
    for i in range(1, len(tokens) - 1):
        prev_t = tokens[i - 1]
        cur_t = tokens[i]
        next_t = tokens[i + 1]
        if (
            cur_t.text.strip() == ""
            and prev_t.bold == next_t.bold
            and prev_t.italic == next_t.italic
            and prev_t.color == next_t.color
        ):
            cur_t.bold = prev_t.bold
            cur_t.italic = prev_t.italic
            cur_t.color = prev_t.color

    # Gộp các token liên tiếp có cùng định dạng
    merged: list[_FormattedToken] = []
    for tok in tokens:
        if not tok.text:
            continue
        if (
            merged
            and merged[-1].bold == tok.bold
            and merged[-1].italic == tok.italic
            and merged[-1].color == tok.color
        ):
            merged[-1].text += tok.text
        else:
            merged.append(_FormattedToken(tok.text, tok.bold, tok.italic, tok.color))

    # Đóng gói thẻ HTML nội dòng, đảm bảo khoảng trắng nằm ngoài thẻ
    parts: list[str] = []
    for tok in merged:
        t = tok.text
        if not (tok.bold or tok.italic or tok.color):
            parts.append(t)
            continue

        m = re.match(r"^(\s*)(.*?)(\s*)$", t, re.DOTALL)
        if not m:
            parts.append(t)
            continue
        l_ws, core, r_ws = m.groups()
        if not core:
            parts.append(t)
            continue

        tagged = core
        if tok.italic:
            tagged = f"<i>{tagged}</i>"
        if tok.bold:
            tagged = f"<b>{tagged}</b>"
        if tok.color:
            tagged = f'<font color="{tok.color}">{tagged}</font>'

        parts.append(l_ws + tagged + r_ws)

    res = "".join(parts)
    return re.sub(r" +", " ", res).strip()


def _join_lines(lines: list[_Line]) -> str:
    text = ""
    for ln in lines:
        t = ln.text
        if not text:
            text = t
        elif text.endswith("-") and len(text) > 1 and text[-2].isalpha() and t[:1].islower():
            text = text[:-1] + t  # "exam-" + "ple" (compound "well-known" cũng bị nối: chấp nhận)
        else:
            text += " " + t
    return text

_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "e.g", "eg", "i.e", "ie",
    "etc", "fig", "al", "inc", "ltd", "corp", "no", "vol", "approx",
}


def _split_sentences(text: str) -> list[str]:
    splits = re.split(r'([.!?…]+[\x22\x27”’\)\]]*\s+)', text)
    sentences = []
    current = ""
    for i in range(0, len(splits), 2):
        part = splits[i]
        delim = splits[i + 1] if i + 1 < len(splits) else ""
        current += part + delim
        clean = re.sub(r"<[^>]+>", "", current).strip()
        words = clean.split()
        if words:
            clean_word = re.sub(r'^[^\w]+|[^\w]+$', '', words[-1].lower())
            if clean_word in _ABBREVIATIONS or clean_word.replace('.', '') in _ABBREVIATIONS:
                continue
            if len(clean_word) == 1 and clean_word.isalpha():
                continue
            if i + 2 < len(splits):
                next_clean = re.sub(r"<[^>]+>", "", splits[i + 2]).lstrip('"\'“”‘’([{').strip()
                if next_clean and next_clean[0].islower() and not re.search(r"[!?]", delim):
                    continue
        if current.strip():
            sentences.append(current.strip())
            current = ""
    if current.strip():
        sentences.append(current.strip())
    return sentences or [text.strip()]


def _extract_block_sentences(
    page: pymupdf.Page, text: str, bbox: tuple[float, float, float, float]
) -> list[dict]:
    s_list = _split_sentences(text)
    clip_rect = pymupdf.Rect(*bbox)
    result = []
    punct_to_strip = '.!?…:;"\x27'
    for s in s_list:
        clean_s = re.sub(r"<[^>]+>", "", s).strip()
        if not clean_s:
            continue
        rects = page.search_for(clean_s, clip=clip_rect)
        if not rects:
            core_s = clean_s.rstrip(punct_to_strip)
            if core_s:
                rects = page.search_for(core_s, clip=clip_rect)
        if not rects:
            words = clean_s.split()
            if len(words) >= 4:
                first_phrase = " ".join(words[:3])
                last_phrase = " ".join(words[-3:])
                r1 = page.search_for(first_phrase, clip=clip_rect)
                r2 = page.search_for(last_phrase, clip=clip_rect)
                if r1 and r2:
                    y0 = min(r.y0 for r in r1)
                    y1 = max(r.y1 for r in r2)
                    rects = [pymupdf.Rect(bbox[0], y0, bbox[2], y1)]
        if not rects:
            rects = [clip_rect]
        result.append({
            "text": s,
            "rects": [[round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2)] for r in rects],
        })
    return result


# ---------------------------------------------------------------- bước 5: gom đoạn qua trang
class _DisjointSet:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))

    def find(self, i: int) -> int:
        if self.parent[i] == i:
            return i
        self.parent[i] = self.find(self.parent[i])
        return self.parent[i]

    def union(self, i: int, j: int) -> None:
        root_i = self.find(i)
        root_j = self.find(j)
        if root_i != root_j:
            self.parent[root_j] = root_i


@dataclass
class _BlockCandidate:
    index: int  # Chỉ số toàn cục trong danh sách blocks
    block: ParsedBlock
    lines: list[_Line]
    avg_size: float
    font: str
    is_heading: bool = False
    is_footnote: bool = False
    is_body: bool = True


def _score_continuation(
    a: _BlockCandidate,
    b: _BlockCandidate,
    page_p_left: float,
    page_p_right: float,
    page_q_left: float,
    page_q_right: float,
    body_font_size: float,
) -> float:
    first_line_b = b.lines[0]
    last_line_a = a.lines[-1]

    # Loại trừ cứng (Hard Rejections)
    if _BULLET.match(first_line_b.text):
        return 0.0
    if abs(a.avg_size - b.avg_size) > 0.8:
        return 0.0
    if not a.is_body or not b.is_body:
        return 0.0

    # Nếu B thụt đầu dòng (indent rõ rệt so với lề thân bài) -> đoạn mới
    if (first_line_b.x0 - page_q_left) > 0.8 * body_font_size:
        return 0.0

    clean_a = re.sub(r"<[^>]+>", "", a.block.text).strip()
    clean_b = re.sub(r"<[^>]+>", "", b.block.text).strip()
    if not clean_a or not clean_b:
        return 0.0

    ends_sentence = bool(_ENDS_SENTENCE.search(clean_a))
    last_line_gap = page_p_right - last_line_a.x1
    # Nếu A kết thúc câu tự nhiên và dòng cuối thụt vào sâu so với lề phải -> kết thúc đoạn
    if ends_sentence and last_line_gap > 2.5 * body_font_size:
        return 0.0

    score = 0.0

    # 1. Tín hiệu cuối block A
    if not ends_sentence:
        score += 2.0
    elif clean_a.endswith((",", ";", ":")):
        score += 2.0

    has_hyphen = (
        (clean_a.endswith("-") or clean_a.endswith("‐"))
        and len(clean_a) > 1
        and clean_a[-2].isalpha()
    )
    if has_hyphen:
        score += 1.5

    last_words = clean_a.split()
    if last_words:
        last_w = last_words[-1].lower()
        if last_w in ("and", "or", "the", "that", "of", "to", "in", "with", "for", "as", "by", "from", "on", "at", "which"):
            score += 1.0

    # 2. Tín hiệu đầu block B
    first_char = clean_b[:1]
    if first_char.islower():
        score += 2.0
        if has_hyphen:
            score += 1.5
    elif ends_sentence:
        # A kết thúc câu VÀ B bắt đầu chữ in hoa -> khả năng cao là 2 đoạn độc lập
        score -= 3.0

    # 3. Hình học / Lề
    # Dòng cuối của A chạm sát lề phải cột/trang
    if last_line_a.x1 >= page_p_right - 1.5 * body_font_size:
        score += 1.0

    # Dòng đầu của B không thụt lề (bắt đầu sát lề trái)
    if abs(first_line_b.x0 - page_q_left) <= 0.6 * body_font_size:
        score += 0.5

    # 4. Font chữ tương đồng
    if a.font and b.font:
        f_a = a.font.lower().split("-")[0].split("+")[-1]
        f_b = b.font.lower().split("-")[0].split("+")[-1]
        if f_a == f_b:
            score += 0.5

    return score


def _link_page_continuations(
    blocks: list[ParsedBlock],
    candidates: list[_BlockCandidate],
    pages: list[ParsedPage],
) -> None:
    if not blocks or len(pages) <= 1:
        for i, b in enumerate(blocks):
            b.group_key = i
            b.part_no = 0
        return

    # 1. Tính cỡ chữ thân bài (body_font_size)
    all_sizes = [l.size for c in candidates for l in c.lines]
    counter = Counter(round(s, 1) for s in all_sizes)
    body_font_size = counter.most_common(1)[0][0] if counter else 11.0

    # 2. Phân loại block thân bài vs tiêu đề vs footnote
    for c in candidates:
        c.is_heading = (c.avg_size > body_font_size + 1.2) or (
            len(c.lines) <= 2
            and c.avg_size >= body_font_size
            and all(s.weight >= 600 for ln in c.lines for s in ln.spans)
        )
        c.is_footnote = c.avg_size < body_font_size - 1.2
        c.is_body = (not c.is_heading) and (not c.is_footnote) and (abs(c.avg_size - body_font_size) <= 1.0)

    # 3. Gom candidates theo trang và tính lề thân bài cho từng trang
    page_cands: dict[int, list[_BlockCandidate]] = defaultdict(list)
    for c in candidates:
        page_cands[c.block.page].append(c)

    page_margins: dict[int, tuple[float, float]] = {}
    for pg in pages:
        p_num = pg.number
        body_lines = [l for c in page_cands[p_num] if c.is_body for l in c.lines]
        if body_lines:
            p_left = min(l.x0 for l in body_lines)
            p_right = max(l.x1 for l in body_lines)
        else:
            p_left = pg.width * 0.1
            p_right = pg.width * 0.9
        page_margins[p_num] = (p_left, p_right)

    dsu = _DisjointSet(len(blocks))

    # 4. Duyệt qua ranh giới các trang
    max_gap = settings.continuation_max_gap_pages
    for p_idx, pg in enumerate(pages):
        p_num = pg.number
        body_on_p = [c for c in page_cands[p_num] if c.is_body]
        if not body_on_p:
            continue
        cand_a = body_on_p[-1]

        # Tìm trang q kế tiếp có block
        for next_offset in range(1, max_gap + 2):
            q_idx = p_idx + next_offset
            if q_idx >= len(pages):
                break
            q_num = pages[q_idx].number
            body_on_q = [c for c in page_cands[q_num] if c.is_body]
            if not body_on_q:
                # Trang trống hoặc chỉ có hình ảnh -> cho phép nhảy qua
                continue

            cand_b = body_on_q[0]

            # Nếu trước cand_b trên trang q có tiêu đề -> không thể nối qua trang
            headings_before_b = [c for c in page_cands[q_num] if c.index < cand_b.index and c.is_heading]
            if headings_before_b:
                break

            p_left, p_right = page_margins[p_num]
            q_left, q_right = page_margins[q_num]

            score = _score_continuation(
                cand_a, cand_b, p_left, p_right, q_left, q_right, body_font_size
            )
            if score >= settings.continuation_threshold:
                dsu.union(cand_a.index, cand_b.index)
            # Đã xét trang nội dung kế tiếp, không duyệt xa hơn
            break

    # 5. Gom nhóm và gán group_key, part_no
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(len(blocks)):
        groups[dsu.find(i)].append(i)

    for root, indices in groups.items():
        indices.sort(key=lambda idx: (blocks[idx].page, blocks[idx].idx))
        for part_no, block_idx in enumerate(indices):
            blocks[block_idx].group_key = root
            blocks[block_idx].part_no = part_no


# ---------------------------------------------------------------- API chính
def _ensure_text_layer(doc: pymupdf.Document) -> None:
    n = doc.page_count
    sample_idx = list(range(0, n, max(1, n // 10)))[:10]
    chars = sum(len(doc[i].get_text().strip()) for i in sample_idx)
    if chars / len(sample_idx) < 80:
        raise NoTextLayerError(
            "PDF does not have a text layer. Only text-based PDFs are supported."
        )


def parse_pdf(path: Path) -> ParsedDocument:
    """CPU-bound: gọi qua asyncio.to_thread() từ code async."""
    try:
        doc = pymupdf.open(path)
    except Exception as e:  # noqa: BLE001
        raise PdfParseError(f"Cannot open PDF: {e}", code="PDF_OPEN_ERROR") from e

    with doc:
        if doc.needs_pass:
            raise PdfParseError("PDF is password protected", code="PDF_PASSWORD_PROTECTED")
        if doc.page_count == 0:
            raise PdfParseError("PDF has no pages", code="PDF_EMPTY")
        _ensure_text_layer(doc)

        pages: list[ParsedPage] = []
        raw_per_page: list[list[_RawBlock]] = []
        for i, page in enumerate(doc):
            r = page.rect
            pages.append(ParsedPage(i + 1, round(r.width, 2), round(r.height, 2)))
            raw_per_page.append(_extract_blocks(page))

        repeated = _repeated_margin_signatures(raw_per_page, pages)

        blocks: list[ParsedBlock] = []
        candidates: list[_BlockCandidate] = []
        for pg_idx, (pg, raws) in enumerate(zip(pages, raw_per_page)):
            doc_page = doc[pg_idx]
            kept = [b for b in raws if not _is_noise(b, pg.height, repeated)]
            lines = [l for b in kept for l in b.lines]
            idx = 0
            for group in _group_paragraphs(lines):
                text = _format_paragraph(group)
                if not text:
                    text = _join_lines(group)
                if sum(c.isalpha() for c in text) < 2:  # số/ký hiệu lẻ
                    continue
                bbox = (
                    round(min(l.x0 for l in group), 2), round(min(l.y0 for l in group), 2),
                    round(max(l.x1 for l in group), 2), round(max(l.y1 for l in group), 2),
                )
                total_chars = sum(len(s.text.strip()) for ln in group for s in ln.spans)
                if total_chars > 0:
                    font_sz = sum(s.size * len(s.text.strip()) for ln in group for s in ln.spans) / total_chars
                else:
                    font_sz = sum(l.size for l in group) / max(1, len(group))
                font_sz = round(font_sz, 1)
                sentences = _extract_block_sentences(doc_page, text, bbox)
                block = ParsedBlock(pg.number, idx, text, bbox, font_size=font_sz, sentences=sentences)
                cand_idx = len(blocks)
                blocks.append(block)

                avg_sz = sum(l.size for l in group) / max(1, len(group))
                font = group[0].spans[0].font if group[0].spans else ""
                candidates.append(_BlockCandidate(cand_idx, block, group, avg_sz, font))
                idx += 1

        if settings.enable_continuation_merge:
            _link_page_continuations(blocks, candidates, pages)
        else:
            for i, b in enumerate(blocks):
                b.group_key = i
                b.part_no = 0

        title = ((doc.metadata or {}).get("title") or "").strip() or None
        return ParsedDocument(title=title, pages=pages, blocks=blocks)
