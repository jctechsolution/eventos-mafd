# Gerador do Kit Digital MAFD Eventos

Gera artes oficiais em PNG para WhatsApp, Instagram e Facebook, além de QR em alta resolução, previews, versões otimizadas, relatório e legendas prontas.

## Executar no PowerShell

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r tools/midias/requirements.txt
python tools/midias/gerar_midias.py
```

Também funciona com o Python global:

```powershell
python -m pip install -r tools/midias/requirements.txt
python tools/midias/gerar_midias.py
```

O processo é offline depois da instalação inicial das dependências. As saídas são gravadas exclusivamente em `dist/midias/`.
