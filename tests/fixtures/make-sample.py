# Builds tests/fixtures/sample.xlsx: made-up data in the original spreadsheet's layout.
# Run: python3 -m venv .venv && .venv/bin/pip install openpyxl && .venv/bin/python tests/fixtures/make-sample.py
import datetime, pathlib, openpyxl
from openpyxl.utils import get_column_letter as L
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Main"
cats = ["alimentacao", "casa", "saude", "transporte", "vicios", "outros", "poupanca", "investimento"]
ws["A1"] = "Updated"
for i, (acc, d, dt, v) in enumerate([("Banco A", "Mercado", datetime.datetime(2026, 1, 27), 11.74), ("Banco B", "Farmácia", datetime.datetime(2026, 1, 20), 5.63)]):
    ws.cell(i + 1, 2, acc); ws.cell(i + 1, 4, d); ws.cell(i + 1, 5, dt); ws.cell(i + 1, 6, v)
months = [(2026, "janeiro", [("mercado semana", "alimentacao", 31.56), ("renda", "casa", 400), ("farmacia", "saude", 6.99), ("uber casa", "transporte", 12.5), ("tabaco", "vicios", 5), ("mealheiro", "poupanca", 50), ("livro <b>&amp;</b>", "outros", "12,40"), ("", "", None), ("=cmd|' /C calc'!A0", "outros", 1)]),
          (2025, "dezembro", [("mercado", "alimentacao", 80.2), ("renda", "casa", 400), ("prenda", "nova categoria", 25), ("comboio", "transporte", 9.1), ("metro", "transportes", 2)]),
          (2025, "novembro", [("mercado", "alimentacao", 60), ("renda", "casa", 400), ("jantar fora", "alimentacao", 22.3)])]
for b, (year, name, items) in enumerate(months):
    c = 1 + b * 3; A, B, C = L(c), L(c + 1), L(c + 2)
    if b == 0 or months[b - 1][0] != year: ws.cell(5, c, year)
    ws.cell(6, c, name); ws.merge_cells(f"{A}6:{C}6"); ws.cell(7, c, "resumo")
    ws.cell(8, c, "maior despesa"); ws.cell(8, c + 1, "categoria"); ws.cell(8, c + 2, "valor")
    for i, cat in enumerate(cats):
        ws.cell(9 + i, c, "-"); ws.cell(9 + i, c + 1, cat); ws.cell(9 + i, c + 2, f"=SUMIF({B}29:{C}349,{B}{9+i},{C}29:{C}349)")
    tr = 9 + len(cats); ws.cell(tr, c + 1, "total"); ws.cell(tr, c + 2, f"=SUM({C}9:{C}{9+5})")  # 6 expense rows (9..14)
    ws.cell(25, c, "conclusao"); ws.cell(26, c, "mês de teste\nsegunda linha" if b == 0 else "-")
    ws.cell(27, c, "extrato"); ws.cell(28, c, "despesa"); ws.cell(28, c + 1, "categoria"); ws.cell(28, c + 2, "valor")
    for i, (d, cat, v) in enumerate(items):
        if d: ws.cell(29 + i, c, d)
        if cat: ws.cell(29 + i, c + 1, cat)
        if v is not None: ws.cell(29 + i, c + 2, v)
g = wb.create_sheet("Goals")
for c, (name, mn, cur, moves) in zip((1, 4), [("férias", 1000, 300, [("janeiro", datetime.datetime(2026, 1, 5), 100), ("fevereiro", "18-02-26", 200)]), ("dívida", "-", 500, [("emprestimo", datetime.datetime(2025, 6, 1), 200)])]):
    g.cell(1, c, name); g.cell(2, c, "valor mínimo"); g.cell(3, c, mn); g.cell(4, c, "valor atual"); g.cell(5, c, cur)
    g.cell(6, c, "valor a repor"); g.cell(8, c, "resumo"); g.cell(9, c, "movimento"); g.cell(9, c + 1, "data"); g.cell(9, c + 2, "valor")
    for i, (d, dt, v) in enumerate(moves): g.cell(10 + i, c, d); g.cell(10 + i, c + 1, dt); g.cell(10 + i, c + 2, v)
wb.save(pathlib.Path(__file__).with_name("sample.xlsx"))
