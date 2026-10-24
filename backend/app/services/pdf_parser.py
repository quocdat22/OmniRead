"""Trích xuất "block" (đoạn văn) từ PDF text-based bằng PyMuPDF.

Quy trình:
  1. Lấy các dòng (line) + cỡ chữ + bbox của từng trang.
  2. Loại header/footer (dòng lặp lại ở lề trên/dưới nhiều trang) và số trang.
  3. Gom các dòng thành đoạn văn bằng heuristic: cỡ chữ, khoảng cách dòng,
     thụt đầu dòng, dấu câu cuối dòng, ký hiệu bullet.
  4. Nối dòng + xử lý gạch nối cuối dòng ("exam-" + "ple" -> "example").

Tọa độ bbox: đơn vị point, gốc ở góc TRÊN-TRÁI, theo hệ tọa độ của page.rect.
Frontend nhân với (canvasWidth / page.width) để định vị overlay.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import pymupdf

from app.config import settings


class PdfParseError(Exception):
    pass


class NoTextLayerError(PdfParseError):
    pass


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
_BULLET = re.compile(r"^\s*(?:[•●▪■◦‣*\-–—]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s+")
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
    threshold = max(3, int(len(pages) * 0.3))
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
        # 1. Đoạn toàn bộ là tiêu đề đậm (baseline >= 600)
        # 2. Hoặc span là Bold/SemiBold (>= 600) và đậm hơn baseline
        # 3. Hoặc span là Medium (500) và đậm hơn baseline (Regular 400 / Light 300)
        if baseline_weight >= 600:
            active_bold = True
        else:
            active_bold = (s.weight >= 600) or (s.weight >= 500 and s.weight > baseline_weight)

        active_italic = s.italic if not baseline_italic else True

        # Bất kỳ màu nào không phải màu đen/xám tối trung tính thì giữ nguyên màu sắc
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
            text = text[:-1] + t  # "exam-" + "ple"  (compound "well-known" cũng bị nối: chấp nhận)
        else:
            text += " " + t
    return text


# ---------------------------------------------------------------- API chính
def _ensure_text_layer(doc: pymupdf.Document) -> None:
    n = doc.page_count
    sample_idx = list(range(0, n, max(1, n // 10)))[:10]
    chars = sum(len(doc[i].get_text().strip()) for i in sample_idx)
    if chars / len(sample_idx) < 80:
        raise NoTextLayerError(
            "PDF không có text layer (có vẻ là bản scan). Ứng dụng chỉ hỗ trợ PDF text-based."
        )


def parse_pdf(path: Path) -> ParsedDocument:
    """CPU-bound: gọi qua asyncio.to_thread() từ code async."""
    try:
        doc = pymupdf.open(path)
    except Exception as e:  # noqa: BLE001
        raise PdfParseError(f"Không mở được PDF: {e}") from e

    with doc:
        if doc.needs_pass:
            raise PdfParseError("PDF được bảo vệ bằng mật khẩu.")
        if doc.page_count == 0:
            raise PdfParseError("PDF không có trang nào.")
        _ensure_text_layer(doc)

        pages: list[ParsedPage] = []
        raw_per_page: list[list[_RawBlock]] = []
        for i, page in enumerate(doc):
            r = page.rect
            pages.append(ParsedPage(i + 1, round(r.width, 2), round(r.height, 2)))
            raw_per_page.append(_extract_blocks(page))

        repeated = _repeated_margin_signatures(raw_per_page, pages)

        blocks: list[ParsedBlock] = []
        for pg, raws in zip(pages, raw_per_page):
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
                blocks.append(ParsedBlock(pg.number, idx, text, bbox))
                idx += 1

        title = ((doc.metadata or {}).get("title") or "").strip() or None
        return ParsedDocument(title=title, pages=pages, blocks=blocks)
