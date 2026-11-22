# UI wireframes

Status: design draft (Phase 2). The labels are the Czech texts of the UI. All names are synthetic.

## 1. Main window, board view

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ✓ Úkoly             [ 🔍 Hledat…  (/) ]          [+ Nový úkol (N)]  ⟳  🔔3  Eva Nová ▾     │
├──────────────────┬─────────────────────────────────────────────────────────────────────────┤
│ Všechny úkoly 42 │ Štítky ▾ Řešitelé ▾ Stav ▾  ☐ Zkontrolované (21)  [Tabule | Tabulka]     │
│ Moje úkoly     5•│ (faktury ×) (Eva Nová ×)  Zrušit filtry                                  │
│ Ke kontrole    2 │                                                                          │
│ Vytvořil(a) jsem 7 │ ○ Nový 4      ◐ Přiřazeno 12   ⏸ Odloženo 3   ✓ Hotovo 2                  │
│                  │ ┌──────────┐  ┌──────────────┐ ┌───────────┐  ┌──────────┐               │
│ ── Správa ──     │ │Objednat  │  │Revize smlouvy│ │Inventura  │  │Zpráva Q3 │               │
│ Koš              │ │toner     │  │‼ 18. 11. 2026│ │           │  │☑ 4/4     │               │
│ Uživatelé        │ │(nákup)   │  │14:00 (právo) │ │(sklad)    │  │💬2 📎1   │               │
│ Štítky           │ │          │  │☑ 2/5  💬3 📎1│ │           │  │ PD       │               │
│ Nastavení        │ └──────────┘  │ EN  PD       │ └───────────┘  └──────────┘               │
│ Žádosti        1 │               └──────────────┘                                           │
│ Kontrolní body   │                                                                          │
│ Audit            │                                                                          │
│ Integrita     ⚠1 │                                                                          │
├──────────────────┴─────────────────────────────────────────────────────────────────────────┤
│ Eva Nová · kontroluje úkoly · aktualizováno před 12 s                                         │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- `•` after a count: the view has unread notifications.
- Dates always have the year: `18. 11. 2026`, with the time if the task has one. A task with no time (`due.allDay`) shows only the date.
- `‼` = overdue (red background, icon and text "po termínu"). Due soon = amber, icon `⏰` and text "brzy".
- Status columns have an icon and a label. The status is clear without color.
- Verified tasks are hidden by default (Q-25): the board shows 4 columns, and the filter row has the switch "Zobrazit zkontrolované (N)". With the switch, or with the status filter "Zkontrolováno", the column "Zkontrolováno" and the verified tasks show. The sidebar counts do not count verified tasks.
- The board has no drag and drop in the first version (Q-15).
- A board column shows 100 cards, the table 200 rows. The button **Zobrazit další …** under the list (for example "Zobrazit dalších 100") shows the next page, and the focus goes to the first new card or row. A change of the filters, the search or the sort starts again at the first page. The count in the header shows all tasks (`docs/performance.md`).
- Admins see **Trvale odstranit soubor** at each attachment that is not purged. The dialog needs a reason and shows how many attachments use the same file.
- An information bar is fixed at the bottom of all screens, also of the start screens: "Úkoly <version> (<commit>) · © 2026 Lukáš Czerner · Licence MIT". The bar has 1 line. Below 520 px it hides the author. "Licence MIT" opens a dialog with the license text from the bundle (no network). The messages show above the bar. The status changes in the task panel. Reason: a drop makes an op with no confirmation, and keyboard use is difficult.
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

Each start screen has the button **English** (**Česky** back) next to the app name (`docs/architecture.md` §8).

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
│     7QD2-MXAP-F4NW-Z3BH-5RK6                   │
│ Čekáme na schválení… (kontrola každých 15 s)   │
└────────────────────────────────────────────────┘
```

Unsupported browser (no File System Access API or no Ed25519):

```text
Tento prohlížeč aplikaci Úkoly nepodporuje. Otevřete soubor v aktuálním Microsoft Edge nebo Google Chrome (verze 137 nebo novější).
```

Opened in the web preview of SharePoint (a frame or a sandboxed page, or the folder picker throws SecurityError): no folder button, only the steps.

```text
┌ Otevřete aplikaci ze složky v počítači ────────────────────────┐
│ Aplikace Úkoly nefunguje v náhledu na webu SharePoint …        │
│ 1. Na webu SharePoint … klikněte na „Synchronizovat“.          │
│ 2. … zvolte „Vždy ponechat na tomto zařízení“.                 │
│ 3. Ve složce Úkoly otevřete soubor app/index.html …            │
│ 4. Klikněte na „Vybrat složku“ …                               │
└────────────────────────────────────────────────────────────────┘
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

- The bell in the header shows the number of unread notifications. A click opens the list. A click outside the list or `Esc` closes it.
- The list shows the unread notifications first, then the newest read ones, at most 50.
- A click on a notification opens its task and marks the notification as read. "Vše přečteno" marks all as read.
- The page title shows the number of unread notifications.
- A view in the sidebar gets a dot `•` when a task of the view has an unread notification.
- The start banner shows 1 time after the start: the overdue tasks of the user, and for verifiers the tasks to verify. Each part is a link to its view. The `×` closes the banner.
- The demo starts with all events unread, so that the list has content. The demo keeps the read state only in memory.

## 7. Admin screens

- **Uživatelé**: a table of users (name, role, verifier, keys, status). Buttons: "Schválit žádost", "Povolit kontrolu úkolů" / "Zrušit kontrolu úkolů", "Správce ano/ne", "Odebrat uživatele", "Nový klíč".
- **Žádosti o přístup**: the files in `enroll/`, with the fingerprint in large letters and "Schválit".
- **Štítky**: name, number of tasks, "Přejmenovat", "Sloučit do…", "Smazat".
- **Nastavení**: the settings of `docs/data-model.md` §7. Each change is a `SetSetting` op.
- **Audit**: all ops, the newest first, with filters: text, author, change type (also the items of a batch), status, time range, task (a chip, from the link "jen tento úkol" or from the task history). Each row shows the time, the author, the change in Czech (a batch shows its items, for example "Vytvoření úkolu, 2× Přidání řešitele"), the changed objects and the status. A click on the change opens the detail: scope, key, `seq`, op ID, signature, item notes, and a table "Co / Pole / Před / Po" with Czech field names and values. The list shows 100 rows, then "Zobrazit dalších 200".
- **Vrátit** (admins only, applied ops only): the dialog shows the fields that later changes overwrote ("Teď" and "Hodnota z vracené změny"), or "Od té doby nikdo tato pole nezměnil.". Then it shows the values after the revert. An op that cannot be reverted shows a Czech reason and a disabled button.
- **Integrita**: the issues grouped by kind, with the count, a Czech description and advice for each kind, and for each issue the file path, the author, `seq` and the technical details.

The **history** tab of the task panel uses the same descriptions: each change with its Czech lines ("Název: Starý → Nový"), at most 6 lines until the user opens it, then the detail table. Admins see "Vrátit" and "Zobrazit v auditu".
- **Koš**: deleted tasks with "Obnovit".
- **Kontrolní body**: number of op files per scope, and "Vytvořit kontrolní bod".

## 7a. Help (built-in guides)

- The page `#/help` shows the user guide, `#/help/admin` the admin guide (admins only, ADR 0015). The left column is the table of contents, the right column the text. Below 1100 px, the table of contents is above the text.
- `?s=<section>` scrolls to a section. A click in the table of contents replaces the history entry.
- Admins see a switch "Nápověda | Příručka správce" above the guide.
- The sidebar has the links **Nápověda** and, for admins, **Příručka správce**, below the views. The information bar has **Nápověda**.
- The start screens open the user guide in a dialog (the link in the information bar).
- **Správa → Uživatelé**: each key that is not revoked, not a root key and not the own key has **Odvolat klíč**. The dialog explains the effect and that a revocation cannot be undone.

## 8. Keyboard

| Key | Action |
|---|---|
| `N` | New task |
| `/` | Focus the search |
| `?` | Open the user guide (**Nápověda**) |
| `Esc` | Close the panel or the dialog. In a text field of the panel: leave the field. |
| Click outside the panel | Close the panel. A click on another task opens that task. With unsaved text in the panel, the panel stays open and a message explains why. |
| `Tab`, `Shift+Tab` | Next or previous control. All controls have a visible focus. |
| `Tab` on a new page | The first stop is the link "Přejít na obsah". `Enter` moves the focus to the main content. |
| Close a dialog | The focus goes back to the control that opened the dialog. |
| `Enter` on a card or a row | Open the task |
