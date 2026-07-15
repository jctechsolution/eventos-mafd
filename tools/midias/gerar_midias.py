from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "dist" / "midias"
PREVIEWS = OUT / "previews"
OPTIMIZED = OUT / "otimizadas"
URL = "https://jctechsolution.github.io/eventos-mafd/"
LOGO_GLOB = "logo-rede-homens.*"

BLACK = "#040404"
BLACK_SOFT = "#0f0e0a"
GOLD = "#c9a44a"
GOLD_LIGHT = "#f2d38b"
GOLD_DARK = "#8b6a24"
IVORY = "#fbf8f0"
TEXT = "#f7efe0"
MUTED = "#c9c0ae"
QR_INK = "#17140d"

TITLE_FONT_PATH = Path("C:/Windows/Fonts/georgiab.ttf")
BODY_FONT_PATH = Path("C:/Windows/Fonts/arial.ttf")
BOLD_FONT_PATH = Path("C:/Windows/Fonts/arialbd.ttf")

SPECS = {
    "MAFD_Story_1080x1920.png": (1080, 1920, "story"),
    "MAFD_Status_WhatsApp_1080x1920.png": (1080, 1920, "status"),
    "MAFD_Feed_1080x1350.png": (1080, 1350, "feed"),
    "MAFD_Quadrado_1080x1080.png": (1080, 1080, "square"),
    "MAFD_WhatsApp_Compartilhamento_1200x1500.png": (1200, 1500, "whatsapp"),
    "MAFD_Facebook_Capa_1640x924.png": (1640, 924, "horizontal"),
}


def locate_logo() -> Path:
    matches = sorted((ROOT / "assets" / "img").glob(LOGO_GLOB))
    if not matches:
        raise FileNotFoundError("Logomarca oficial assets/img/logo-rede-homens.* nao encontrada")
    return matches[0]


LOGO = locate_logo()


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    fallback = TITLE_FONT_PATH if path == TITLE_FONT_PATH else BODY_FONT_PATH
    return ImageFont.truetype(str(path if path.exists() else fallback), size=size)


def background(width: int, height: int, variant: int = 0) -> Image.Image:
    y, x = np.ogrid[:height, :width]
    cx = width * (0.48 if variant % 2 == 0 else 0.58)
    cy = height * (0.25 if height > width else 0.48)
    radius = np.sqrt(((x - cx) / max(width, 1)) ** 2 + ((y - cy) / max(height, 1)) ** 2)
    glow = np.clip(1 - radius * 2.15, 0, 1) ** 2
    base = np.zeros((height, width, 3), dtype=np.float32)
    base[:] = np.array([4, 4, 4], dtype=np.float32)
    base += glow[..., None] * np.array([42, 31, 8], dtype=np.float32)
    vertical = np.linspace(10, 0, height, dtype=np.float32)[:, None, None]
    base += vertical
    image = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(image)
    rng = np.random.default_rng(20260808 + variant)
    for _ in range(max(30, width * height // 70000)):
        px, py = int(rng.integers(40, width - 40)), int(rng.integers(40, height - 40))
        alpha = int(rng.integers(25, 85))
        color = (201, 164, 74, alpha)
        radius_px = int(rng.integers(1, 3))
        overlay = Image.new("RGBA", image.size)
        ImageDraw.Draw(overlay).ellipse((px-radius_px, py-radius_px, px+radius_px, py+radius_px), fill=color)
        image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    return image


def add_frame(image: Image.Image, margin: int) -> None:
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((margin, margin, image.width-margin-1, image.height-margin-1), radius=34,
                           outline=GOLD_DARK, width=3)
    inner = margin + 13
    draw.rounded_rectangle((inner, inner, image.width-inner-1, image.height-inner-1), radius=26,
                           outline="#3f3214", width=1)


def load_logo(max_size: tuple[int, int]) -> Image.Image:
    logo = Image.open(LOGO).convert("RGB")
    logo.thumbnail(max_size, Image.Resampling.LANCZOS)
    return logo


def paste_logo(image: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    x, y, w, h = box
    halo = Image.new("RGBA", image.size)
    hd = ImageDraw.Draw(halo)
    cx, cy = x + w // 2, y + h // 2
    hd.ellipse((cx-w//2-35, cy-h//2-35, cx+w//2+35, cy+h//2+35), fill=(201, 164, 74, 42))
    halo = halo.filter(ImageFilter.GaussianBlur(28))
    image.paste(Image.alpha_composite(image.convert("RGBA"), halo).convert("RGB"))
    logo = load_logo((w, h))
    left, top = x + (w-logo.width)//2, y + (h-logo.height)//2
    image.paste(logo, (left, top))
    return left, top, left+logo.width, top+logo.height


def create_qr(size: int) -> Image.Image:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=20, border=4)
    qr.add_data(URL)
    qr.make(fit=True)
    image = qr.make_image(fill_color=QR_INK, back_color=IVORY).convert("RGB")
    image = image.resize((size, size), Image.Resampling.NEAREST)
    logo = load_logo((int(size * 0.17), int(size * 0.17)))
    guard = int(size * 0.21)
    plate = Image.new("RGB", (guard, guard), IVORY)
    plate.paste(logo, ((guard-logo.width)//2, (guard-logo.height)//2))
    mask = Image.new("L", plate.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, guard-1, guard-1), radius=max(8, size//70), fill=255)
    image.paste(plate, ((size-guard)//2, (size-guard)//2), mask)
    return image


def paste_qr(image: Image.Image, qr: Image.Image, x: int, y: int) -> tuple[int, int, int, int]:
    pad = max(8, qr.width // 45)
    plate = Image.new("RGB", (qr.width + pad*2, qr.height + pad*2), IVORY)
    plate.paste(qr, (pad, pad))
    image.paste(plate, (x-pad, y-pad))
    return x-pad, y-pad, x+qr.width+pad, y+qr.height+pad


def fit_font(text: str, path: Path, preferred: int, max_width: int, minimum: int = 24) -> ImageFont.FreeTypeFont:
    size = preferred
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    while size >= minimum:
        chosen = font(path, size)
        if probe.textbbox((0, 0), text, font=chosen)[2] <= max_width:
            return chosen
        size -= 1
    raise ValueError(f"Texto nao cabe na largura segura: {text}")


def centered(image: Image.Image, text: str, y: int, path: Path, size: int, color: str,
             safe: tuple[int, int, int, int], spacing: int = 4) -> list[tuple[int, int, int, int]]:
    draw = ImageDraw.Draw(image)
    lines = text.split("\n")
    boxes = []
    current_y = y
    for line in lines:
        chosen = fit_font(line, path, size, safe[2]-safe[0])
        bbox = draw.textbbox((0, 0), line, font=chosen)
        width, height = bbox[2]-bbox[0], bbox[3]-bbox[1]
        x = (image.width-width)//2
        draw.text((x, current_y-bbox[1]), line, font=chosen, fill=color)
        boxes.append((x, current_y, x+width, current_y+height))
        current_y += height + spacing
    return boxes


def left_text(image: Image.Image, text: str, x: int, y: int, path: Path, size: int, color: str,
              max_width: int, spacing: int = 5) -> list[tuple[int, int, int, int]]:
    draw = ImageDraw.Draw(image)
    boxes=[]; current_y=y
    for line in text.split("\n"):
        chosen=fit_font(line,path,size,max_width)
        bbox=draw.textbbox((0,0),line,font=chosen); width=bbox[2]-bbox[0]; height=bbox[3]-bbox[1]
        draw.text((x,current_y-bbox[1]),line,font=chosen,fill=color)
        boxes.append((x,current_y,x+width,current_y+height)); current_y += height+spacing
    return boxes


def add_rule(image: Image.Image, y: int, width: int = 220) -> None:
    x=(image.width-width)//2
    ImageDraw.Draw(image).line((x,y,x+width,y),fill=GOLD_DARK,width=3)


def validate_boxes(boxes: list[tuple[int,int,int,int]], safe: tuple[int,int,int,int], name: str) -> None:
    l,t,r,b=safe
    for box in boxes:
        if box[0] < l or box[1] < t or box[2] > r or box[3] > b:
            raise ValueError(f"Conteudo fora da area segura em {name}: {box} vs {safe}")


def portrait_art(width: int, height: int, kind: str, qr_master: Image.Image, variant: int) -> Image.Image:
    image=background(width,height,variant); add_frame(image,42 if height>1500 else 30)
    if kind in ("story","status"):
        safe=(120,180,width-120,height-220); boxes=[]
        boxes.append(paste_logo(image,(430,190,220,220)))
        boxes += centered(image,"REDE DE HOMENS • MAFD",430,BOLD_FONT_PATH,32,GOLD_LIGHT,safe)
        add_rule(image,478,260)
        boxes += centered(image,"FESTA DE\nCRENTE...",510,TITLE_FONT_PATH,92,TEXT,safe,0)
        boxes += centered(image,"COM HOMENS DE DEUS",705,BOLD_FONT_PATH,50,GOLD_LIGHT,safe)
        boxes += centered(image,"Uma noite preparada\npara transformar vidas.",780,BODY_FONT_PATH,34,TEXT,safe,5)
        qr=qr_master.resize((410,410),Image.Resampling.NEAREST); boxes.append(paste_qr(image,qr,335,900))
        boxes += centered(image,"ESCANEIE O QR CODE\nE CONFIRME SUA PRESENÇA",1345,BOLD_FONT_PATH,36,GOLD_LIGHT,safe,4)
        boxes += centered(image,"SUA CONFIRMAÇÃO GARANTE\nPARTICIPAÇÃO NO SORTEIO\nOFICIAL DE BRINDES",1470,BOLD_FONT_PATH,28,TEXT,safe,6)
        boxes += centered(image,"08 DE AGOSTO DE 2026",1608,BOLD_FONT_PATH,38,GOLD_LIGHT,safe)
        boxes += centered(image,"17H ÀS 21H",1662,BOLD_FONT_PATH,32,TEXT,safe)
    elif kind == "feed":
        safe=(80,80,width-80,height-80); boxes=[]
        boxes.append(paste_logo(image,(465,85,150,150)))
        boxes += centered(image,"REDE DE HOMENS • MAFD",250,BOLD_FONT_PATH,28,GOLD_LIGHT,safe)
        boxes += centered(image,"FESTA DE\nCRENTE...",305,TITLE_FONT_PATH,76,TEXT,safe,0)
        boxes += centered(image,"COM HOMENS DE DEUS",455,BOLD_FONT_PATH,42,GOLD_LIGHT,safe)
        boxes += centered(image,"Uma noite preparada para transformar vidas.",520,BODY_FONT_PATH,28,TEXT,safe)
        qr=qr_master.resize((340,340),Image.Resampling.NEAREST); boxes.append(paste_qr(image,qr,370,585))
        boxes += centered(image,"ESCANEIE E CONFIRME SUA PRESENÇA",960,BOLD_FONT_PATH,30,GOLD_LIGHT,safe)
        boxes += centered(image,"SUA CONFIRMAÇÃO GARANTE PARTICIPAÇÃO\nNO SORTEIO OFICIAL DE BRINDES",1030,BOLD_FONT_PATH,25,TEXT,safe,5)
        boxes += centered(image,"08 DE AGOSTO DE 2026 • 17H ÀS 21H",1175,BOLD_FONT_PATH,31,GOLD_LIGHT,safe)
    elif kind == "whatsapp":
        safe=(90,90,width-90,height-90); boxes=[]
        boxes.append(paste_logo(image,(510,95,180,180)))
        boxes += centered(image,"REDE DE HOMENS • MAFD",290,BOLD_FONT_PATH,30,GOLD_LIGHT,safe)
        boxes += centered(image,"FESTA DE\nCRENTE...",345,TITLE_FONT_PATH,84,TEXT,safe,0)
        boxes += centered(image,"COM HOMENS DE DEUS",510,BOLD_FONT_PATH,46,GOLD_LIGHT,safe)
        qr=qr_master.resize((410,410),Image.Resampling.NEAREST); boxes.append(paste_qr(image,qr,395,600))
        boxes += centered(image,"ESCANEIE O QR CODE\nE CONFIRME SUA PRESENÇA",1045,BOLD_FONT_PATH,34,GOLD_LIGHT,safe,4)
        boxes += centered(image,"SUA CONFIRMAÇÃO GARANTE PARTICIPAÇÃO\nNO SORTEIO OFICIAL DE BRINDES",1165,BOLD_FONT_PATH,29,TEXT,safe,6)
        boxes += centered(image,"08 DE AGOSTO DE 2026 • 17H ÀS 21H",1330,BOLD_FONT_PATH,34,GOLD_LIGHT,safe)
    else:
        raise ValueError(kind)
    validate_boxes(boxes,safe,kind); return image


def square_art(qr_master: Image.Image) -> Image.Image:
    width=height=1080; image=background(width,height,4); add_frame(image,28); safe=(70,70,1010,1010); boxes=[]
    boxes.append(paste_logo(image,(475,75,130,130)))
    boxes += centered(image,"FESTA DE CRENTE...",225,TITLE_FONT_PATH,66,TEXT,safe)
    boxes += centered(image,"COM HOMENS DE DEUS",315,BOLD_FONT_PATH,40,GOLD_LIGHT,safe)
    qr=qr_master.resize((320,320),Image.Resampling.NEAREST); boxes.append(paste_qr(image,qr,380,400))
    boxes += centered(image,"CONFIRME SUA PRESENÇA",760,BOLD_FONT_PATH,34,GOLD_LIGHT,safe)
    boxes += centered(image,"SORTEIO OFICIAL DE BRINDES",825,BOLD_FONT_PATH,28,TEXT,safe)
    boxes += centered(image,"08 AGO 2026",920,BOLD_FONT_PATH,42,GOLD_LIGHT,safe)
    validate_boxes(boxes,safe,"square"); return image


def horizontal_art(qr_master: Image.Image) -> Image.Image:
    width,height=1640,924; image=background(width,height,5); add_frame(image,34); safe=(80,80,1560,844); boxes=[]
    boxes.append(paste_logo(image,(135,105,180,180)))
    boxes += left_text(image,"REDE DE HOMENS • MAFD",360,115,BOLD_FONT_PATH,28,GOLD_LIGHT,650)
    boxes += left_text(image,"FESTA DE\nCRENTE...",115,345,TITLE_FONT_PATH,82,TEXT,720,0)
    boxes += left_text(image,"COM HOMENS DE DEUS",115,525,BOLD_FONT_PATH,44,GOLD_LIGHT,760)
    boxes += left_text(image,"Uma noite preparada para transformar vidas.",115,605,BODY_FONT_PATH,28,TEXT,760)
    boxes += left_text(image,"08 DE AGOSTO DE 2026 • 17H ÀS 21H",115,710,BOLD_FONT_PATH,30,GOLD_LIGHT,760)
    qr=qr_master.resize((390,390),Image.Resampling.NEAREST); boxes.append(paste_qr(image,qr,1110,135))
    right_safe=(930,80,1560,844)
    boxes += centered_region(image,"ESCANEIE E CONFIRME\nSUA PRESENÇA",930,1560,575,BOLD_FONT_PATH,32,GOLD_LIGHT,right_safe)
    boxes += centered_region(image,"SUA CONFIRMAÇÃO GARANTE\nPARTICIPAÇÃO NO SORTEIO\nOFICIAL DE BRINDES",930,1560,680,BOLD_FONT_PATH,25,TEXT,right_safe)
    validate_boxes(boxes,safe,"horizontal"); return image


def centered_region(image: Image.Image, text: str, left: int, right: int, y: int, path: Path, size: int,
                    color: str, safe: tuple[int,int,int,int], spacing: int=4) -> list[tuple[int,int,int,int]]:
    draw=ImageDraw.Draw(image); boxes=[]; current_y=y
    for line in text.split("\n"):
        chosen=fit_font(line,path,size,right-left)
        bbox=draw.textbbox((0,0),line,font=chosen); w=bbox[2]-bbox[0]; h=bbox[3]-bbox[1]; x=left+(right-left-w)//2
        draw.text((x,current_y-bbox[1]),line,font=chosen,fill=color); boxes.append((x,current_y,x+w,current_y+h)); current_y += h+spacing
    return boxes


def decode_qr(path: Path) -> tuple[bool,str]:
    image=cv2.imdecode(np.fromfile(path,dtype=np.uint8),cv2.IMREAD_COLOR)
    if image is None: return False,"arquivo nao lido"
    value,_,_=cv2.QRCodeDetector().detectAndDecode(image)
    return value == URL, value


def save_derivatives(path: Path, image: Image.Image) -> None:
    image.save(path,"PNG",optimize=True,dpi=(144,144))
    preview=image.copy(); preview.thumbnail((420,420),Image.Resampling.LANCZOS)
    preview.save(PREVIEWS/f"preview_{path.stem}.png","PNG",optimize=True)
    optimized=image.copy(); optimized.thumbnail((900,1200),Image.Resampling.LANCZOS)
    optimized.save(OPTIMIZED/path.name,"PNG",optimize=True)


def write_instructions() -> None:
    content="""KIT DIGITAL MAFD EVENTOS

LEGENDA PARA WHATSAPP

FESTA DE CRENTE... COM HOMENS DE DEUS

Uma noite de fé, comunhão, adoração e transformação.

Data: 08 de agosto de 2026
Horário: 17h às 21h

Confirme sua presença pelo link:
https://jctechsolution.github.io/eventos-mafd/

Ao confirmar, você recebe seu ingresso digital com QR Code e garante sua participação no sorteio oficial de brindes.

Convide outro homem e compartilhe esta mensagem.

LEGENDA PARA INSTAGRAM

FESTA DE CRENTE... COM HOMENS DE DEUS

Uma jornada preparada para transformar vidas.

No dia 08 de agosto, homens estarão reunidos para viver uma noite de adoração, Palavra, comunhão e fortalecimento espiritual.

Confirme sua presença pelo QR Code da arte ou pelo link da bio.

Sua confirmação garante participação no sorteio oficial de brindes.

08 de agosto de 2026
17h às 21h
MAFD — Manaus

#MAFD
#RedeDeHomens
#HomensDeDeus
#FestaDeCrente
#Comunhão
#Adoração
#Manaus

USO RECOMENDADO

- Use os arquivos principais para publicação com máxima qualidade.
- Use dist/midias/otimizadas para envios mais leves.
- Os previews servem somente para conferência rápida.
- Não recorte o QR Code nem aplique filtros sobre ele.
"""
    (OUT/"INSTRUCOES_DE_USO_MIDIAS.txt").write_text(content,encoding="utf-8")


def write_report(results: list[tuple[Path,bool,str]]) -> None:
    lines=["RELATORIO DE GERACAO - KIT DIGITAL MAFD EVENTOS","",f"Data e hora: {datetime.now().astimezone().isoformat(timespec='seconds')}",
           f"Logo usada: {LOGO.relative_to(ROOT)}",f"URL do QR: {URL}","Fontes: Georgia Bold (titulo), Arial e Arial Bold (textos)",
           "Fallback de fonte utilizado: sim; Playfair Display e Inter nao estavam instaladas localmente.","Formato: PNG RGB","", "ARQUIVOS:"]
    for path,valid,value in results:
        with Image.open(path) as image:
            lines.append(f"- {path.name}: {image.width} x {image.height}px; {path.stat().st_size} bytes; QR={'OK' if valid else 'FALHOU'}; valor={value or 'nenhum'}")
    lines += ["", "Limitacoes:", "- As fontes da Landing Page foram substituidas pelos fallbacks locais permitidos.",
              "", "Comando para regenerar:", "python -m pip install -r tools/midias/requirements.txt", "python tools/midias/gerar_midias.py"]
    (OUT/"RELATORIO_GERACAO_MIDIAS.txt").write_text("\n".join(lines)+"\n",encoding="utf-8")


def main() -> int:
    OUT.mkdir(parents=True,exist_ok=True); PREVIEWS.mkdir(exist_ok=True); OPTIMIZED.mkdir(exist_ok=True)
    if URL != "https://jctechsolution.github.io/eventos-mafd/": raise ValueError("URL divergente")
    for required in (LOGO,TITLE_FONT_PATH,BODY_FONT_PATH,BOLD_FONT_PATH):
        if not required.exists(): raise FileNotFoundError(required)
    qr_master=create_qr(2000); qr_path=OUT/"MAFD_QR_Evento_2000px.png"; qr_master.save(qr_path,"PNG",optimize=True,dpi=(300,300))
    results=[]
    for index,(name,(width,height,kind)) in enumerate(SPECS.items()):
        if kind in ("story","status","feed","whatsapp"): image=portrait_art(width,height,kind,qr_master,index)
        elif kind=="square": image=square_art(qr_master)
        else: image=horizontal_art(qr_master)
        if image.mode!="RGB" or image.size!=(width,height): raise ValueError(f"Saida invalida: {name}")
        path=OUT/name; save_derivatives(path,image); valid,value=decode_qr(path)
        if not valid: raise ValueError(f"QR nao decodificado em {name}: {value}")
        results.append((path,valid,value)); print(f"OK: {name} ({width}x{height})")
    qr_valid,qr_value=decode_qr(qr_path)
    if not qr_valid: raise ValueError("QR isolado nao foi decodificado")
    results.append((qr_path,qr_valid,qr_value)); write_instructions(); write_report(results)
    old_patterns=("81922980","559281922980")
    for path in OUT.rglob("*"):
        if path.is_file() and path.suffix.lower() in (".txt",".md"):
            text=path.read_text(encoding="utf-8")
            if any(pattern in text for pattern in old_patterns): raise ValueError(f"Numero antigo encontrado em {path}")
    print("Todos os QR Codes foram validados com sucesso."); return 0


if __name__=="__main__":
    try: raise SystemExit(main())
    except Exception as exc:
        print(f"ERRO: {exc}",file=sys.stderr); raise
