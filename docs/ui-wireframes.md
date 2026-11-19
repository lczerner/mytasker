# UI wireframes

Status: design draft (Phase 2). The labels are the Czech texts of the UI. All names are synthetic.

## 1. Main window, board view

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ✓ Úkoly             [ 🔍 Hledat…  (/) ]          [+ Nový úkol (N)]  ⟳  🔔3  Eva Nová ▾     │
├──────────────────┬─────────────────────────────────────────────────────────────────────────┤
│ Všechny úkoly 42 │ Štítky ▾  Řešitelé ▾  Stav ▾      [Tabule | Tabulka]                     │
│ Moje úkoly     5•│ (faktury ×) (Eva Nová ×)  Zrušit filtry                                  │
│ Ke kontrole    2 │                                                                          │
│ Vytvořené mnou 7 │ ○ Nový 4  ◐ Přiřazeno 12   ⏸ Odloženo 3   ✓ Hotovo 2   ✔✔ Zkontrolováno 21│
│                  │ ┌──────────┐  ┌──────────────┐ ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│ ── Správa ──     │ │Objednat  │  │Revize smlouvy│ │Inventura  │  │Zpráva Q3 │  │…         │ │
│ Koš              │ │toner     │  │‼ 18. 11. 2026│ │           │  │☑ 4/4     │  │          │ │
│ Uživatelé        │ │(nákup)   │  │14:00 (právo) │ │(sklad)    │  │💬2 📎1   │  │          │ │
│ Štítky           │ │          │  │☑ 2/5  💬3 📎1│ │           │  │ PD       │  │          │ │
│ Nastavení        │ └──────────┘  │ EN  PD       │ └───────────┘  └──────────┘  └──────────┘ │
│ Žádosti        1 │               └──────────────┘                                           │
│ Kontrolní body   │                                                                          │
│ Audit            │                                                                          │
│ Integrita     ⚠1 │                                                                          │
├──────────────────┴─────────────────────────────────────────────────────────────────────────┤
│ Eva Nová · ověřovatel · aktualizováno před 12 s                                              │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- `•` after a count: the view has unread notifications.
- Dates always have the year: `18. 11. 2026`, with the time if the task has one. A task with no time (`due.allDay`) shows only the date.
- `‼` = overdue (red background, icon and text "po termínu"). Due soon = amber, icon `⏰` and text "brzy".
- Status columns have an icon and a label. The status is clear without color.
- The board has no drag and drop in the first version (Q-15). The status changes in the task panel. Reason: a drop makes an op with no confirmation, and keyboard use is difficult.
- The "Správa" section shows only to admins. "Ke kontrole" shows only to verifiers and admins.

## 2. Table view

```text
│ Název ▲        │ Stav        │ Řešitelé │ Štítky         │ Termín               │ Vytvořeno    │
├────────────────┼─────────────┼──────────┼────────────────┼──────────────────────┼──────────────┤
│ Revize smlouvy │ ◐ Přiřazeno │ EN PD    │ právo, faktury │ ‼ 18. 11. 2026 14:00 │ 2. 11. 2026  │
│ Objednat toner │ ○ Nový      │ —        │ nákup          │                      │ 17. 11. 2026 │
│ Zpráva Q3      │ ✓ Hotovo    │ PD       │                │ 30. 11. 2026 12:00   │ 1. 10. 2026  │
```

Click a column header to sort. Click again to reverse. The sort uses Czech collation (`Intl.Collator('cs')`).

## 3. Task panel (drawer)

```text
                                  ┌──────────────────────────────────────────────┐
                                  │ Revize smlouvy                         [×]   │
                                  │ ◐ Přiřazeno   [Hotovo] [Odložit] [Smazat]    │
                                  │ Termín: [18. 11. 2026] [14:00]  ‼ po termínu │
                                  │ Vytvořil(a) Eva Nová před 17 dny             │
                                  ├──────────────────────────────────────────────┤
                                  │ Popis                              [Upravit] │
                                  │ Zkontrolovat **článek 4** a přílohu.         │
                                  ├──────────────────────────────────────────────┤
                                  │ Podúkoly 2/5                                 │
                                  │ ☑ Přečíst smlouvu               ↑ ↓  ✎  🗑   │
                                  │ ☐ Poslat připomínky                          │
                                  │ [+ Přidat podúkol]                           │
                                  ├──────────────────────────────────────────────┤
                                  │ Přílohy a odkazy                             │
                                  │ 📎 smlouva.pdf (240 kB)   [Stáhnout]         │
                                  │ 🖼 [náhled] foto.jpg                         │
                                  │ 🔗 Registr smluv ↗                           │
                                  │ [+ Soubor] [+ Odkaz]                         │
                                  ├──────────────────────────────────────────────┤
                                  │ Řešitelé: (Eva Nová ×) (Petr Dvořák ×) [+]   │
                                  │ Štítky:   (právo ×) (faktury ×) [+]          │
                                  ├──────────────────────────────────────────────┤
                                  │ [Konverzace 3] [Historie 14]                 │
                                  │ PD  Petr Dvořák · před 2 h                   │
                                  │     @Eva Nová článek 4 je v pořádku.         │
                                  │ [ Napsat komentář…                ] [Odeslat] │
                                  └──────────────────────────────────────────────┘
```

- The status buttons are the transitions that `authorize` and the state machine permit for this user now.
- Edits save at once as an op. A small text "Uloženo" confirms it.
- "Historie" lists the ops of the task: who, when (`wallTime`, with the note "čas podle počítače autora"), what changed (old → new), and superseded or rejected ops.
- An admin sees "Vrátit změnu" (revert) on each history item.

## 4. Dialogs

```text
┌ Nový úkol ───────────────────────────────┐   ┌ Označit jako hotové ─────────────────────┐
│ Název*  [                              ] │   │ 2 z 5 podúkolů nejsou splněné.           │
│ Popis   [                              ] │   │ Datum dokončení [19. 11. 2026] [10:42]   │
│ Termín  [          ] [     ]             │   │                  [Zrušit] [Označit hotové]│
│ Řešitelé [+]   Štítky [+]                │   └──────────────────────────────────────────┘
│                    [Zrušit] [Vytvořit]   │
└──────────────────────────────────────────┘   ┌ Vrátit k přepracování ───────────────────┐
                                               │ Důvod* [                               ] │
                                               │                     [Zrušit] [Vrátit]    │
                                               └──────────────────────────────────────────┘
```

## 5. Start screens

```text
┌ Úkoly ─────────────────────────────────────────┐   ┌ Odemknout ───────────────────────────┐
│ Vyberte sdílenou složku Úkoly na OneDrive.     │   │ Eva Nová                             │
│ [Vybrat složku]                                │   │ Soubor s klíčem: eva.ukoly-key ✓     │
│                                                │   │ Heslo [••••••••••]                   │
│ Nová instalace (jen pro prvního správce)       │   │                         [Odemknout]  │
│ Mám nový počítač / jsem nový uživatel          │   └──────────────────────────────────────┘
└────────────────────────────────────────────────┘
┌ Žádost o přístup ──────────────────────────────┐
│ Žádost byla uložena. Sdělte správci otisk:     │
│        K7QD-2MXA-PF4N-WZ3B                     │
│ Čekáme na schválení… (kontrola každých 15 s)   │
└────────────────────────────────────────────────┘
```

Unsupported browser (no File System Access API or no Ed25519):

```text
Tento prohlížeč aplikaci Úkoly nepodporuje. Otevřete soubor v aktuálním Microsoft Edge nebo Google Chrome (verze 137 nebo novější).
```

## 6. Notification centre

```text
                                      ┌ Upozornění ─────────── [Vše přečteno] ┐
                                      │ ‼ Revize smlouvy je po termínu (1 den) │
                                      │ ⏰ Inventura: termín zítra v 9:00       │
                                      │ @ Petr Dvořák vás zmínil: Revize…      │
                                      │ ↩ Zpráva Q3 vrácena k přepracování     │
                                      │ ⚠ Vaše změna stavu nebyla použita      │
                                      └────────────────────────────────────────┘
```

Start-up banner: "2 úkoly po termínu · 1 úkol čeká na kontrolu". The page title: `(3) Úkoly`.

## 7. Admin screens

- **Uživatelé**: a table of users (name, role, verifier, keys, status). Buttons: "Schválit žádost", "Ověřovatel ano/ne", "Správce ano/ne", "Odebrat uživatele", "Nový klíč".
- **Žádosti o přístup**: the files in `enroll/`, with the fingerprint in large letters and "Schválit".
- **Štítky**: name, number of tasks, "Přejmenovat", "Sloučit do…", "Smazat".
- **Nastavení**: the settings of `docs/data-model.md` §7. Each change is a `SetSetting` op.
- **Audit**: all ops with filters (author, op type, time range, task, status of the op).
- **Integrita**: rejected ops, chain gaps, forks, unknown files, blob hash errors.
- **Koš**: deleted tasks with "Obnovit".
- **Kontrolní body**: number of op files per scope, and "Vytvořit kontrolní bod".

## 8. Keyboard

| Key | Action |
|---|---|
| `N` | New task |
| `/` | Focus the search |
| `Esc` | Close the panel or the dialog |
| `Tab`, `Shift+Tab` | Next or previous control. All controls have a visible focus. |
| `Enter` on a card or a row | Open the task |
