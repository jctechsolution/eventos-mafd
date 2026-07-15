# Gerador do kit oficial de convites MAFD

Gera os dois PDFs A4 frente e verso, previews, QR de conferência, relatório e instruções de impressão sem alterar a aplicação web.

## Uso no Windows PowerShell

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r tools/convites/requirements.txt
python tools/convites/gerar_convites.py
```

Também pode ser executado com o Python global:

```powershell
python -m pip install -r tools/convites/requirements.txt
python tools/convites/gerar_convites.py
```

Os arquivos finais são gravados em `dist/convites/`.

## Impressão

Use A4 retrato, frente e verso, virada na borda longa, escala 100% e desative qualquer opção de ajuste à página. Faça uma folha de teste antes da tiragem.

O PDF premium permanece vetorial e pronto para avaliação de pré-impressão. A conversão PDF/X só é tentada quando uma instalação compatível do Ghostscript está disponível; o relatório nunca declara PDF/X sem conversão efetiva.
