# Expenses (expenses.appdoivo.com): ChatGPT design prompts

Goal: a calm, trustworthy money app that feels like a beautiful paper ledger brought into
today: clear numbers first, never busy, as good on a laptop (most use) as on a phone. It
must not look AI-generated or like a template. Attach the current screenshots
(`current-month-desktop.png`, `current-month-phone.png`, `current-charts-desktop.png`; in
~/Downloads/expenses-refs/) to prompt 1 so ChatGPT designs on top of the real content.

Send all prompts in the same chat so the style stays the same.

---

## 1. Four directions on one board

Redesign this personal expenses web app (screenshots attached). Keep exactly this content
on the main screen: a top bar with the name "Despesas", a menu (Mês, Pesquisar, Gráficos,
Contas Divididas, Objetivos, Definições), a moon icon and an "EN" button; the month title
"Janeiro 2026" with arrows and an "Este Mês" button; three numbers (Gasto 468,45 €,
Poupado 50,00 €, Entradas 7); an "Adicionar Despesa" row (Descrição, Categoria, Valor,
Data, Conta, Adicionar); the list of expenses (Descrição, Categoria, Data, Valor); and on
the right a "Resumo" card (each category with its total and the biggest expense in small
text, then Total), a "Conclusão" card with a short text, and "Onde Ficou".

Show 4 different directions side by side on one board, each as a desktop screen, A to D:
A. Ledger paper: warm off-white paper, fine ruled lines, ink-blue accents, serif headings.
B. Swiss calm: white and light grey, one strong colour, big tabular numbers, strict grid.
C. Night ledger: deep charcoal, soft cream text, one warm accent, quiet and focused.
D. Soft pastel: gentle tinted cards (sage, sand, sky), rounded, friendly but still serious.

Rules: numbers are the hero and line up (tabular figures); calm and spacious; no stock
3D, no coins or piggy banks, no neon, no busy illustrations, no logos or brand names;
the background is never one flat colour (a subtle paper, grain or soft gradient).

## 2. The chosen direction, desktop and phone

Make direction [LETTER] as two finished screens: desktop 1536×1024 and phone 1024×1536.
On the phone the menu is a row of small icons with labels under the top bar (nothing
pinned to the bottom edge), the three numbers stay in one row, and the add form stacks.
Same words as the screenshots.

## 3. Dark and light

Show the same phone screen twice side by side: the light version and a dark version that
feels like the same app at night.

## 4. The charts page

In the same style, design "Gráficos" (desktop 1536×1024): a "Últimos 12 Meses / Este Ano /
Desde Sempre" switch; "Gastos por Mês" as thin single-colour columns with a tooltip on one
bar; "Para Onde Foi o Dinheiro" as horizontal bars per category, biggest first, with the
value and percentage; "Gastos por Ano". One colour for all bars, no legend boxes.

## 5. Texture and icons only (no text)

From the chosen design give me ONLY: (a) the background texture (1536×1024, seamless
edges, no text, no UI), and (b) on a plain pure #00ff00 green background, the six menu
icons (month, search, charts, split bills, goals, settings) and an app icon, spaced apart,
as clean line icons. No letters anywhere.

---

Tips
- If text appears in 5, reply: "Same image, but remove every letter and word."
- Send me the images and I'll build it: I keep every word, number and screen from the real
  app; the images give the look (colours, type, texture, icons go into `app.css` tokens).

## Other AI tools worth trying for mockups

- **Google Stitch** (stitch.withgoogle.com): designs real app screens from a prompt or a
  screenshot and exports to Figma or HTML; strong for app UI layouts.
- **Figma Make / Figma AI**: if the mockup should become an editable Figma file.
- **v0 (vercel.com)**: quick interactive UI drafts from a prompt.
- **Midjourney**: best for textures, paper and backgrounds (not for UI with text).
- ChatGPT stays the main one for the full-screen mockups, as with the other sites.
