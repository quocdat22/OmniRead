"""Test formatted extraction from PDF with bold, italic, and color tags."""
import os
import tempfile
from pathlib import Path
import pymupdf

from app.services.pdf_parser import parse_pdf, _is_neutral_dark


def test_is_neutral_dark():
    assert _is_neutral_dark(0x000000) is True
    assert _is_neutral_dark(0x231F20) is True  # InDesign K100
    assert _is_neutral_dark(0x1A1A1A) is True  # Dark gray
    assert _is_neutral_dark(0x990000) is False  # Dark red
    assert _is_neutral_dark(0x0000FF) is False  # Blue
    assert _is_neutral_dark(0xA9541E) is False  # Orange brown


def test_formatted_pdf_extraction():
    tmp_dir = tempfile.mkdtemp()
    pdf_path = Path(tmp_dir) / "styled.pdf"

    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)

    # Insert heading
    page.insert_text((72, 80), "Bold Heading Title", fontname="helv", fontsize=16)

    # Insert a paragraph with normal, italic, bold, and colored words
    # In PyMuPDF, insert_text allows specifying color and fontname
    y = 140
    # Line 1: normal text + italic word + normal text
    page.insert_text((72, y), "This paragraph mentions ", fontname="times-roman", fontsize=11, color=(0, 0, 0))
    page.insert_text((195, y), "data engineering", fontname="times-italic", fontsize=11, color=(0, 0, 0))
    page.insert_text((280, y), " and its concepts.", fontname="times-roman", fontsize=11, color=(0, 0, 0))

    # Line 2: normal text + red link
    y += 20
    page.insert_text((72, y), "Refer to ", fontname="times-roman", fontsize=11, color=(0, 0, 0))
    page.insert_text((115, y), "Figure 1-1", fontname="times-bold", fontsize=11, color=(0.6, 0, 0))
    page.insert_text((170, y), " for more details.", fontname="times-roman", fontsize=11, color=(0, 0, 0))

    doc.save(pdf_path)
    doc.close()

    parsed = parse_pdf(pdf_path)
    assert len(parsed.blocks) >= 2

    # Check paragraph blocks
    assert any("<i>data engineering</i>" in b.text for b in parsed.blocks)
    assert any('<font color="#990000"><b>Figure 1-1</b></font>' in b.text for b in parsed.blocks)
    fig_block = next(b for b in parsed.blocks if "Figure 1-1" in b.text)
    assert fig_block.text == 'Refer to <font color="#990000"><b>Figure 1-1</b></font> for more details.'
