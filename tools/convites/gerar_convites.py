from __future__ import annotations

import math
import shutil
import sys
from datetime import datetime
from pathlib import Path

import fitz
import qrcode
from PIL import Image
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


MM_TO_PT = 72.0 / 25.4
PAGE_W_MM, PAGE_H_MM = 210.0, 297.0
CARD_W_MM, CARD_H_MM = 60.0, 120.0
BLEED_MM, SAFE_MM = 3.0, 4.0
COLS_MM = (15.0, 75.0, 135.0)
ROWS_MM = (28.5, 148.5)
EVENT_URL = "https://jctechsolution.github.io/eventos-mafd/"

BLACK = HexColor("#040404")
BLACK_SOFT = HexColor("#0f0e0a")
GOLD = HexColor("#c9a44a")
GOLD_LIGHT = HexColor("#f2d38b")
GOLD_DARK = HexColor("#8b6a24")
IVORY = HexColor("#fbf8f0")
LIGHT_TEXT = HexColor("#f7efe0")
MUTED = HexColor("#c9c0ae")
INK = HexColor("#17140d")

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "dist" / "convites"
LOGO = ROOT / "assets" / "img" / "logo-rede-homens.jpeg"
PREMIUM = OUT / "Convites_MAFD_Grafica_Premium_A4.pdf"
HOME = OUT / "Convites_MAFD_Impressao_Caseira_A4.pdf"
FRONT_TITLE = "FESTA DE CRENTE..."
FRONT_TITLE_MAX_PT = 15.0
FRONT_TITLE_MIN_PT = 12.5
FRONT_TITLE_STEP_PT = 0.25
FRONT_USEFUL_WIDTH_MM = CARD_W_MM - SAFE_MM * 2
FRONT_LOGO_W_MM = 28.0
FRONT_LOGO_H_MM = 28.0
FRONT_UPPER_USEFUL_H_MM = 100.0


def mm(value: float) -> float:
    return value * MM_TO_PT


def register_fonts() -> tuple[str, str, str, list[str]]:
    candidates = {
        "title": [Path("C:/Windows/Fonts/georgiab.ttf"), Path("C:/Windows/Fonts/georgia.ttf")],
        "body": [Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/calibri.ttf")],
        "body_bold": [Path("C:/Windows/Fonts/arialbd.ttf"), Path("C:/Windows/Fonts/calibrib.ttf")],
    }
    selected: dict[str, str] = {}
    embedded: list[str] = []
    for key, paths in candidates.items():
        path = next((item for item in paths if item.exists()), None)
        if path:
            name = f"MAFD-{key}"
            pdfmetrics.registerFont(TTFont(name, str(path)))
            selected[key] = name
            embedded.append(f"{name} ({path.name})")
    selected.setdefault("title", "Times-Bold")
    selected.setdefault("body", "Helvetica")
    selected.setdefault("body_bold", "Helvetica-Bold")
    return selected["title"], selected["body"], selected["body_bold"], embedded


TITLE_FONT, BODY_FONT, BOLD_FONT, EMBEDDED_FONTS = register_fonts()


def centered_text(c: canvas.Canvas, text: str, cx_mm: float, y_mm: float, font: str, size: float, color) -> None:
    c.setFont(font, size)
    c.setFillColor(color)
    c.drawCentredString(mm(cx_mm), mm(y_mm), text)


def assert_text_fits(text: str, font: str, size: float, max_width_mm: float) -> None:
    width = pdfmetrics.stringWidth(text, font, size) / MM_TO_PT
    if width > max_width_mm + 0.01:
        raise ValueError(f"Texto excede a area segura ({width:.2f} mm): {text}")


def fitted_font_size(text: str, font: str, max_size: float, min_size: float, max_width_mm: float) -> float:
    size = max_size
    while size >= min_size:
        if pdfmetrics.stringWidth(text, font, size) / MM_TO_PT <= max_width_mm + 0.01:
            return round(size, 2)
        size -= FRONT_TITLE_STEP_PT
    raise ValueError(f"Titulo nao cabe em uma linha no tamanho minimo de {min_size:.1f} pt: {text}")


FRONT_TITLE_SIZE_PT = fitted_font_size(
    FRONT_TITLE, TITLE_FONT, FRONT_TITLE_MAX_PT, FRONT_TITLE_MIN_PT, FRONT_USEFUL_WIDTH_MM
)


def draw_contained_image(c: canvas.Canvas, image_path: Path, x_mm: float, y_mm: float, w_mm: float, h_mm: float) -> None:
    with Image.open(image_path) as image:
        iw, ih = image.size
    scale = min(w_mm / iw, h_mm / ih)
    width, height = iw * scale, ih * scale
    c.drawImage(ImageReader(str(image_path)), mm(x_mm + (w_mm - width) / 2), mm(y_mm + (h_mm - height) / 2),
                mm(width), mm(height), preserveAspectRatio=True, mask="auto")


def qr_matrix():
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=12, border=4)
    qr.add_data(EVENT_URL)
    qr.make(fit=True)
    return qr, qr.get_matrix()


QR_OBJECT, QR_MATRIX = qr_matrix()


def draw_vector_qr(c: canvas.Canvas, x_mm: float, y_mm: float, size_mm: float, with_logo: bool = True) -> None:
    count = len(QR_MATRIX)
    module = size_mm / count
    c.setFillColor(IVORY)
    c.rect(mm(x_mm), mm(y_mm), mm(size_mm), mm(size_mm), fill=1, stroke=0)
    c.setFillColor(INK)
    for row, values in enumerate(QR_MATRIX):
        for col, enabled in enumerate(values):
            if enabled:
                c.rect(mm(x_mm + col * module), mm(y_mm + (count - row - 1) * module),
                       mm(module + 0.015), mm(module + 0.015), fill=1, stroke=0)
    if with_logo and LOGO.exists():
        logo_size = size_mm * 0.17
        guard_size = size_mm * 0.205
        gx = x_mm + (size_mm - guard_size) / 2
        gy = y_mm + (size_mm - guard_size) / 2
        c.setFillColor(IVORY)
        c.roundRect(mm(gx), mm(gy), mm(guard_size), mm(guard_size), mm(0.8), fill=1, stroke=0)
        lx = x_mm + (size_mm - logo_size) / 2
        ly = y_mm + (size_mm - logo_size) / 2
        draw_contained_image(c, LOGO, lx, ly, logo_size, logo_size)


def draw_gift_icon(c: canvas.Canvas, cx: float, cy: float) -> None:
    c.setStrokeColor(GOLD_LIGHT)
    c.setLineWidth(0.55)
    c.rect(mm(cx - 2.3), mm(cy - 1.7), mm(4.6), mm(3.4), fill=0, stroke=1)
    c.line(mm(cx), mm(cy - 1.7), mm(cx), mm(cy + 1.7))
    c.line(mm(cx - 2.7), mm(cy + 1.7), mm(cx + 2.7), mm(cy + 1.7))
    c.bezier(mm(cx), mm(cy + 1.7), mm(cx - 3), mm(cy + 4), mm(cx - 3), mm(cy + 0.8), mm(cx), mm(cy + 1.7))
    c.bezier(mm(cx), mm(cy + 1.7), mm(cx + 3), mm(cy + 4), mm(cx + 3), mm(cy + 0.8), mm(cx), mm(cy + 1.7))


def draw_front(c: canvas.Canvas, x: float, y: float, premium: bool) -> None:
    bleed = BLEED_MM if premium else 0
    c.setFillColorCMYK(0.72, 0.64, 0.62, 0.92) if premium else c.setFillColor(BLACK)
    c.rect(mm(x - bleed), mm(y - bleed), mm(CARD_W_MM + bleed * 2), mm(CARD_H_MM + bleed * 2), fill=1, stroke=0)
    draw_contained_image(c, LOGO, x + 16, y + 88, FRONT_LOGO_W_MM, FRONT_LOGO_H_MM)
    centered_text(c, FRONT_TITLE, x + 30, y + 82, TITLE_FONT, FRONT_TITLE_SIZE_PT, LIGHT_TEXT)
    centered_text(c, "COM HOMENS DE DEUS", x + 30, y + 76.5, BOLD_FONT, 12.5, GOLD_LIGHT)
    centered_text(c, "Uma noite preparada para transformar vidas.", x + 30, y + 71.5, BODY_FONT, 7, LIGHT_TEXT)
    draw_vector_qr(c, x + 14, y + 37, 32, with_logo=True)
    centered_text(c, "ESCANEIE E CONFIRME", x + 30, y + 33.2, BOLD_FONT, 8.5, GOLD_LIGHT)
    centered_text(c, "SUA PRESENÇA", x + 30, y + 29.8, BOLD_FONT, 8.5, GOLD_LIGHT)
    draw_gift_icon(c, x + 30, y + 27)
    centered_text(c, "BENEFÍCIO EXCLUSIVO", x + 30, y + 22.8, BOLD_FONT, 7.5, GOLD_LIGHT)
    centered_text(c, "Sua confirmação garante", x + 30, y + 18.9, BODY_FONT, 7.5, LIGHT_TEXT)
    centered_text(c, "participação no sorteio", x + 30, y + 15.6, BODY_FONT, 7.5, LIGHT_TEXT)
    centered_text(c, "oficial de brindes.", x + 30, y + 12.3, BODY_FONT, 7.5, LIGHT_TEXT)
    centered_text(c, "08 AGO 2026", x + 30, y + 7.9, BOLD_FONT, 10, GOLD_LIGHT)
    centered_text(c, "Convite individual", x + 30, y + 4.6, BODY_FONT, 7.5, MUTED)


def draw_back(c: canvas.Canvas, x: float, y: float, premium: bool) -> None:
    bleed = BLEED_MM if premium else 0
    c.setFillColor(IVORY)
    c.rect(mm(x - bleed), mm(y - bleed), mm(CARD_W_MM + bleed * 2), mm(CARD_H_MM + bleed * 2), fill=1, stroke=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.75)
    c.line(mm(x + 23), mm(y + 111), mm(x + 37), mm(y + 111))
    c.circle(mm(x + 30), mm(y + 111), mm(1.2), fill=0, stroke=1)
    centered_text(c, "“Provem e vejam", x + 30, y + 96, TITLE_FONT, 11, INK)
    centered_text(c, "como o Senhor é bom;", x + 30, y + 90, TITLE_FONT, 11, INK)
    centered_text(c, "feliz é aquele que nele", x + 30, y + 84, TITLE_FONT, 11, INK)
    centered_text(c, "se refugia.”", x + 30, y + 78, TITLE_FONT, 11, INK)
    centered_text(c, "Salmos 34:8", x + 30, y + 70.5, BOLD_FONT, 9, GOLD_DARK)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.5)
    c.line(mm(x + 15), mm(y + 64.5), mm(x + 45), mm(y + 64.5))
    centered_text(c, "Você foi especialmente", x + 30, y + 58, BOLD_FONT, 10, INK)
    centered_text(c, "convidado.", x + 30, y + 53, BOLD_FONT, 10, INK)
    centered_text(c, "Escaneie o QR Code da frente", x + 30, y + 45.5, BODY_FONT, 9.5, INK)
    centered_text(c, "e descubra uma experiência", x + 30, y + 41, BODY_FONT, 9.5, INK)
    centered_text(c, "que Deus preparou para você.", x + 30, y + 36.5, BODY_FONT, 9.5, INK)
    centered_text(c, "MAFD", x + 30, y + 25, TITLE_FONT, 15, GOLD_DARK)
    centered_text(c, "Ministério Apostólico", x + 30, y + 19, BOLD_FONT, 8.5, INK)
    centered_text(c, "Fortaleza de Davi", x + 30, y + 15, BOLD_FONT, 8.5, INK)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.75)
    c.line(mm(x + 23), mm(y + 7), mm(x + 37), mm(y + 7))


def draw_crop_marks(c: canvas.Canvas) -> None:
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.25)
    gap, length = 1.7, 4.5
    for x in (15, 75, 135, 195):
        c.line(mm(x), mm(28.5 - gap), mm(x), mm(28.5 - gap - length))
        c.line(mm(x), mm(268.5 + gap), mm(x), mm(268.5 + gap + length))
    for y in (28.5, 148.5, 268.5):
        c.line(mm(15 - gap), mm(y), mm(15 - gap - length), mm(y))
        c.line(mm(195 + gap), mm(y), mm(195 + gap + length), mm(y))


def draw_home_cut_lines(c: canvas.Canvas) -> None:
    c.setStrokeColor(HexColor("#777777"))
    c.setLineWidth(0.25)
    for x in (15, 75, 135, 195):
        c.line(mm(x), mm(28.5), mm(x), mm(268.5))
    for y in (28.5, 148.5, 268.5):
        c.line(mm(15), mm(y), mm(195), mm(y))


def build_pdf(path: Path, premium: bool) -> None:
    c = canvas.Canvas(str(path), pagesize=(mm(PAGE_W_MM), mm(PAGE_H_MM)), pageCompression=1)
    c.setTitle("Kit Oficial de Convites MAFD Eventos")
    c.setAuthor("MAFD - Ministério Apostólico Fortaleza de Davi")
    c.setSubject("Convites 60 x 120 mm - impressão frente e verso em A4")
    c.setKeywords("MAFD, Rede de Homens, convite, evento, impressão")
    for side in ("front", "back"):
        for row_y in ROWS_MM:
            for col_x in COLS_MM:
                (draw_front if side == "front" else draw_back)(c, col_x, row_y, premium)
        draw_crop_marks(c) if premium else draw_home_cut_lines(c)
        c.showPage()
    c.save()


def make_qr_png() -> Path:
    path = OUT / "qr_evento.png"
    image = QR_OBJECT.make_image(fill_color="#17140d", back_color="#fbf8f0").convert("RGB")
    image = image.resize((1350, 1350), Image.Resampling.NEAREST)
    if LOGO.exists():
        logo = Image.open(LOGO).convert("RGB")
        logo.thumbnail((230, 230), Image.Resampling.LANCZOS)
        guard = Image.new("RGB", (276, 276), "#fbf8f0")
        guard.paste(logo, ((276 - logo.width) // 2, (276 - logo.height) // 2))
        image.paste(guard, ((1350 - 276) // 2, (1350 - 276) // 2))
    else:
        print("AVISO: logo indisponivel; QR gerado sem logo.")
    image.save(path, dpi=(300, 300))
    return path


def render_previews() -> None:
    document = fitz.open(PREMIUM)
    matrix = fitz.Matrix(200 / 72, 200 / 72)
    document[0].get_pixmap(matrix=matrix, alpha=False).save(OUT / "preview_frente.png")
    document[1].get_pixmap(matrix=matrix, alpha=False).save(OUT / "preview_verso.png")
    first_front = fitz.Rect(
        mm(COLS_MM[0]), mm(PAGE_H_MM - ROWS_MM[1] - CARD_H_MM),
        mm(COLS_MM[0] + CARD_W_MM), mm(PAGE_H_MM - ROWS_MM[1]),
    )
    document[0].get_pixmap(
        matrix=fitz.Matrix(300 / 72, 300 / 72), clip=first_front, alpha=False
    ).save(OUT / "preview_frente_ampliada.png")
    document.close()


def validate_text_widths() -> None:
    lines = [
        (FRONT_TITLE, TITLE_FONT, FRONT_TITLE_SIZE_PT),
        ("COM HOMENS DE DEUS", BOLD_FONT, 12.5),
        ("Uma noite preparada para transformar vidas.", BODY_FONT, 7),
        ("ESCANEIE E CONFIRME", BOLD_FONT, 8.5),
        ("Sua confirmação garante", BODY_FONT, 7.5), ("participação no sorteio", BODY_FONT, 7.5),
        ("“Provem e vejam", TITLE_FONT, 11), ("como o Senhor é bom;", TITLE_FONT, 11),
        ("feliz é aquele que nele", TITLE_FONT, 11), ("se refugia.”", TITLE_FONT, 11),
        ("Você foi especialmente", BOLD_FONT, 10), ("convidado.", BOLD_FONT, 10),
        ("Escaneie o QR Code da frente", BODY_FONT, 9.5),
        ("e descubra uma experiência", BODY_FONT, 9.5),
        ("que Deus preparou para você.", BODY_FONT, 9.5),
    ]
    for text, font, size in lines:
        assert_text_fits(text, font, size, CARD_W_MM - SAFE_MM * 2)


def validate_front_content() -> None:
    text = PdfReader(str(PREMIUM)).pages[0].extract_text()
    if "REDE DE HOMENS" in text:
        raise ValueError("Texto superior removido ainda aparece na frente")
    if text.count(FRONT_TITLE) != 6:
        raise ValueError("Titulo da frente nao foi preservado em uma unica linha nos seis convites")
    if FRONT_LOGO_W_MM > FRONT_USEFUL_WIDTH_MM:
        raise ValueError("Logo ultrapassa a area segura")


def decode_rendered_qr() -> tuple[bool, str]:
    try:
        import cv2
        import numpy as np
        doc = fitz.open(PREMIUM)
        pix = doc[0].get_pixmap(matrix=fitz.Matrix(300 / 72, 300 / 72), alpha=False)
        page = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        doc.close()
        px = 300 / 25.4
        left = int((15 + 12) * px)
        right = int((15 + 48) * px)
        top = int((297 - (148.5 + 73)) * px)
        bottom = int((297 - (148.5 + 37)) * px)
        crop = page[max(0, top):min(page.shape[0], bottom), max(0, left):min(page.shape[1], right), :3]
        value, _, _ = cv2.QRCodeDetector().detectAndDecode(crop)
        return value == EVENT_URL, value
    except Exception as error:
        return False, f"validacao indisponivel: {error}"


def validate_pdfs() -> None:
    expected_w, expected_h = mm(PAGE_W_MM), mm(PAGE_H_MM)
    for path in (PREMIUM, HOME):
        if not path.exists() or path.stat().st_size < 10_000:
            raise ValueError(f"PDF vazio ou ausente: {path}")
        reader = PdfReader(str(path))
        if len(reader.pages) != 2:
            raise ValueError(f"{path.name} nao possui exatamente duas paginas")
        for page in reader.pages:
            box = page.mediabox
            if not math.isclose(float(box.width), expected_w, abs_tol=0.02) or not math.isclose(float(box.height), expected_h, abs_tol=0.02):
                raise ValueError(f"MediaBox incorreto em {path.name}")
    if COLS_MM != (15.0, 75.0, 135.0) or ROWS_MM != (28.5, 148.5):
        raise ValueError("Coordenadas de imposicao alteradas")
    if CARD_W_MM != 60 or CARD_H_MM != 120:
        raise ValueError("Dimensoes de corte alteradas")


def write_instructions() -> None:
    text = """KIT OFICIAL DE CONVITES MAFD EVENTOS

DIAGRAMA DE IMPOSICAO

Pagina 1:
F1 | F2 | F3
F4 | F5 | F6

Pagina 2:
V1 | V2 | V3
V4 | V5 | V6

VERSAO CASEIRA

- Papel A4 retrato.
- Impressao frente e verso.
- Virar na borda longa.
- Escala 100% ou tamanho real.
- Desativar "Ajustar a pagina".
- Centralizar na folha.
- Fazer uma folha de teste.
- Conferir alinhamento antes da tiragem final.
- Impressoras domesticas podem apresentar deslocamento mecanico de 1 a 3 mm.

VERSAO GRAFICA

- Tamanho final: 60 x 120 mm.
- Sangria: 3 mm.
- Area de seguranca: 4 mm.
- Duas paginas: frente e verso.
- Solicitar impressao frente e verso com registro.
- Solicitar prova fisica antes da tiragem.
- Sugestao de papel: couche fosco 250 g/m2 ou 300 g/m2.
- Cantos arredondados opcionais, raio aproximado de 4 a 5 mm.
"""
    (OUT / "INSTRUCOES_DE_IMPRESSAO.txt").write_text(text, encoding="utf-8")


def write_report(qr_valid: bool, qr_value: str) -> None:
    gs = shutil.which("gswin64c") or shutil.which("gs")
    limitations = []
    if not gs:
        limitations.append("Ghostscript nao encontrado: PDF/X nao foi produzido nem validado.")
    if not qr_valid:
        limitations.append(f"Leitura automatica do QR renderizado nao confirmada ({qr_value}).")
    report = f"""RELATORIO DE GERACAO - KIT DE CONVITES MAFD

Data e hora: {datetime.now().astimezone().isoformat(timespec='seconds')}
Logo usada: {LOGO.relative_to(ROOT)}
Texto superior removido: sim
Titulo da frente: {FRONT_TITLE}
Titulo em uma unica linha: sim
Tamanho final da fonte do titulo: {FRONT_TITLE_SIZE_PT:.2f} pt
Dimensoes da caixa da logo na frente: {FRONT_LOGO_W_MM:.0f} x {FRONT_LOGO_H_MM:.0f} mm (proporcao preservada, ajuste contain)
Ocupacao aproximada da logo na altura util superior: {FRONT_LOGO_H_MM / FRONT_UPPER_USEFUL_H_MM * 100:.0f}%
URL do QR: {EVENT_URL}
Pagina: {PAGE_W_MM:.0f} x {PAGE_H_MM:.0f} mm (A4 retrato)
Convite: {CARD_W_MM:.0f} x {CARD_H_MM:.0f} mm
Imposicao: 3 colunas x 2 linhas
Sangria premium: {BLEED_MM:.0f} mm
Area de seguranca: {SAFE_MM:.0f} mm
QR: 32 mm, vetorial nos PDFs, correcao H, quiet zone de 4 modulos
Logo no QR: 17% da largura, com area clara de protecao
Fontes: {', '.join(EMBEDDED_FONTS) if EMBEDDED_FONTS else 'fontes PDF base'}
Fontes incorporadas: {'sim' if EMBEDDED_FONTS else 'somente fontes PDF base'}
Quantidade de paginas por PDF: 2
QR decodificado apos renderizacao: {'sim' if qr_valid else 'nao'}
Valor decodificado: {qr_value or 'nenhum'}
PDF/X produzido: nao
PDF/X validado: nao
Padrao PDF/X: nao aplicavel
PDFs premium e caseiro regenerados: sim

Limitacoes:
{chr(10).join('- ' + item for item in limitations) if limitations else '- Nenhuma limitacao registrada.'}

Comandos para regenerar:
python -m pip install -r tools/convites/requirements.txt
python tools/convites/gerar_convites.py
"""
    (OUT / "RELATORIO_GERACAO.txt").write_text(report, encoding="utf-8")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    if not LOGO.exists():
        raise FileNotFoundError(f"Logo oficial nao encontrada: {LOGO}")
    if EVENT_URL != "https://jctechsolution.github.io/eventos-mafd/":
        raise ValueError("URL do QR divergente")
    validate_text_widths()
    build_pdf(PREMIUM, premium=True)
    build_pdf(HOME, premium=False)
    make_qr_png()
    render_previews()
    validate_pdfs()
    validate_front_content()
    qr_valid, qr_value = decode_rendered_qr()
    write_instructions()
    write_report(qr_valid, qr_value)
    print(f"OK: {PREMIUM}")
    print(f"OK: {HOME}")
    print(f"QR validado: {qr_valid} ({qr_value or 'sem leitura'})")
    print("PDF/X: nao produzido (Ghostscript ausente).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        raise
