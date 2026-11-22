// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// All visible texts of the UI (Czech). The structure permits more languages later.
// Dates: Europe/Prague, cs-CZ. Plurals: Intl.PluralRules('cs'). Sorting: Intl.Collator('cs').

import type { Status } from '../domain/constants';

export const TZ = 'Europe/Prague';
export const LOCALE = 'cs-CZ';

const cs = {
  appName: 'Úkoly',
  // ---- Start screens ----
  'gate.unsupported.title': 'Tento prohlížeč aplikaci Úkoly nepodporuje',
  'gate.unsupported.text': 'Otevřete soubor v aktuálním Microsoft Edge nebo Google Chrome (verze 137 nebo novější).',
  'gate.unsupported.fsa': 'Chybí přístup ke složkám (File System Access API).',
  'gate.unsupported.secure': 'Stránka neběží v zabezpečeném kontextu.',
  'gate.unsupported.idb': 'Chybí úložiště prohlížeče (IndexedDB).',
  'gate.unsupported.ed25519': 'Chybí podpora elektronického podpisu Ed25519.',
  'gate.pick.title': 'Vyberte sdílenou složku Úkoly',
  'gate.pick.text': 'Vyberte složku Úkoly z OneDrive na tomto počítači (složku, která obsahuje podsložky app, roles a data).',
  'gate.pick.button': 'Vybrat složku',
  'gate.permission': 'Povolit přístup ke složce {name}',
  'gate.wrongFolder': 'Ve vybrané složce chybí podsložka app. Vyberte hlavní složku Úkoly.',
  'gate.newInstall.title': 'Nová instalace',
  'gate.newInstall.text': 'Ve složce zatím není kořen důvěry. Pokud jste první správce, vytvořte instalaci. Jinak vyberte správnou složku.',
  'gate.newInstall.button': 'Vytvořit novou instalaci',
  'gate.key.title': 'Váš klíč',
  'gate.key.new': 'Jsem nový uživatel / mám nový počítač',
  'gate.key.open': 'Otevřít soubor s klíčem',
  'gate.key.inside': 'Soubor s klíčem nesmí být ve sdílené složce. Uložte ho do své osobní složky.',
  'gate.key.notKey': 'Tento soubor není klíč aplikace Úkoly.',
  'gate.create.title': 'Nový klíč',
  'gate.create.name': 'Vaše jméno',
  'gate.create.pass': 'Heslo ke klíči (alespoň 12 znaků)',
  'gate.create.pass2': 'Heslo znovu',
  'gate.create.passShort': 'Heslo musí mít alespoň 12 znaků.',
  'gate.create.passDiff': 'Hesla se neshodují.',
  'gate.create.save': 'Vytvořit a uložit klíč',
  'gate.create.saveHint': 'Soubor s klíčem uložte do své osobní složky (ne do sdílené složky). Bez něj a bez hesla se do aplikace nedostanete.',
  'gate.unlock.title': 'Odemknout',
  'gate.unlock.pass': 'Heslo',
  'gate.unlock.button': 'Odemknout',
  'gate.unlock.wrong': 'Nesprávné heslo nebo poškozený soubor s klíčem.',
  'gate.unlock.other': 'Použít jiný klíč',
  'gate.enroll.title': 'Žádost o přístup',
  'gate.enroll.sent': 'Žádost byla uložena. Sdělte správci tento otisk (telefonem nebo osobně):',
  'gate.enroll.waiting': 'Čekáme na schválení. Aplikace to kontroluje automaticky (interval {s} s).',
  'gate.enroll.send': 'Odeslat žádost o přístup',
  'gate.removed': 'Váš přístup byl ukončen. Obraťte se na správce.',
  'gate.fingerprint': 'Otisk kořene důvěry',
  'gate.loading': 'Načítám data…',
  // ---- Shell ----
  'nav.all': 'Všechny úkoly',
  'nav.mine': 'Moje úkoly',
  'nav.review': 'Ke kontrole',
  'nav.created': 'Vytvořil(a) jsem',
  'nav.skip': 'Přejít na obsah',
  'nav.admin': 'Správa',
  'nav.trash': 'Koš',
  'nav.users': 'Uživatelé',
  'nav.enroll': 'Žádosti',
  'nav.tags': 'Štítky',
  'nav.settings': 'Nastavení',
  'nav.checkpoints': 'Kontrolní body',
  'nav.audit': 'Audit',
  'nav.integrity': 'Integrita',
  'top.search': 'Hledat…',
  'top.searchLabel': 'Hledat v úkolech',
  'top.new': 'Nový úkol',
  'top.refresh': 'Načíst změny',
  'top.notifications': 'Upozornění',
  'notif.allRead': 'Vše přečteno',
  'notif.empty': 'Žádná upozornění.',
  'notif.new': 'Nové:',
  'notif.dot': 'Nepřečtená upozornění',
  'notif.unknownTask': 'neznámý úkol',
  'notif.due': 'Blíží se termín',
  'notif.overdue': 'Po termínu',
  'notif.assigned': 'Přiřazeno vám',
  'notif.comment': 'Nový komentář',
  'notif.mention': 'Zmínka v komentáři',
  'notif.returned': 'Vráceno k přepracování',
  'notif.superseded': 'Vaše změna nebyla použita (úkol se mezitím změnil)',
  'notif.verify': 'Čeká na kontrolu',
  'banner.overdue': '{n} po termínu',
  'banner.close': 'Zavřít přehled',
  'top.lock': 'Zamknout',
  'top.changeFolder': 'Změnit složku',
  'top.updated': 'aktualizováno {when}',
  'demo.banner': 'UKÁZKOVÝ REŽIM – smyšlená data, nic se neukládá',
  'demo.as': 'Přihlášen(a) jako',
  // ---- Views ----
  'view.board': 'Tabule',
  'view.table': 'Tabulka',
  'view.empty': 'Žádné úkoly.',
  'view.emptyFiltered': 'Žádné úkoly neodpovídají filtrům.',
  'filter.tags': 'Štítky',
  'filter.assignees': 'Řešitelé',
  'filter.status': 'Stav',
  'filter.unassigned': 'nepřiřazeno',
  'filter.clear': 'Zrušit filtry',
  'filter.showVerified': 'Zobrazit zkontrolované ({n})',
  'filter.remove': 'Odebrat filtr {name}',
  'col.title': 'Název',
  'col.status': 'Stav',
  'col.assignees': 'Řešitelé',
  'col.tags': 'Štítky',
  'col.due': 'Termín',
  'col.created': 'Vytvořeno',
  'col.sortBy': 'Řadit podle: {name}',
  'due.overdue': 'po termínu',
  'due.soon': 'brzy',
  'card.subtasks': 'Podúkoly {done} z {total}',
  'card.comments': 'Komentáře: {n}',
  'card.attachments': 'Přílohy: {n}',
  // ---- Status ----
  'status.new': 'Nový',
  'status.assigned': 'Přiřazeno',
  'status.postponed': 'Odloženo',
  'status.done': 'Hotovo',
  'status.verified': 'Zkontrolováno',
  'status.deleted': 'Smazáno',
  // ---- Actions ----
  'act.PostponeTask': 'Odložit',
  'act.ResumeTask': 'Pokračovat',
  'act.CompleteTask': 'Hotovo',
  'act.VerifyTask': 'Zkontrolováno',
  'act.ReturnTask': 'Vrátit k přepracování',
  'act.ReopenTask': 'Znovu otevřít',
  'act.DeleteTask': 'Smazat',
  'act.RestoreTask': 'Obnovit z koše',
  // ---- Task panel ----
  'task.close': 'Zavřít',
  'task.createdBy': 'Vytvořil(a) {name} {when}',
  'task.title': 'Název',
  'task.description': 'Popis',
  'task.descriptionEmpty': 'Bez popisu.',
  'task.edit': 'Upravit',
  'task.save': 'Uložit',
  'task.cancel': 'Zrušit',
  'task.saved': 'Uloženo',
  'task.unsaved': 'V panelu je neuložená změna. Uložte ji, nebo panel zavřete křížkem.',
  'task.due': 'Termín',
  'task.dueNone': 'bez termínu',
  'task.dueTime': 'Čas (nepovinný)',
  'task.dueClear': 'Odebrat termín',
  'task.subtasks': 'Podúkoly',
  'task.subtaskAdd': 'Přidat podúkol',
  'task.subtaskUp': 'Posunout nahoru',
  'task.subtaskDown': 'Posunout dolů',
  'task.subtaskRemove': 'Odebrat podúkol',
  'task.subtaskEdit': 'Upravit podúkol',
  'task.files': 'Přílohy a odkazy',
  'task.fileAdd': 'Přidat soubor',
  'task.linkAdd': 'Přidat odkaz',
  'task.linkUrl': 'Adresa odkazu (začíná http:, https: nebo mailto:)',
  'task.linkTitle': 'Popisek (nepovinný)',
  'task.download': 'Stáhnout',
  'task.filePurge': 'Trvale odstranit soubor',
  'task.filePurgeText': 'Soubor „{name}“ se trvale odstraní ze sdílené složky. Je přiložený celkem u {n}. U všech se zobrazí „odstraněno“.',
  'task.filePurgedUpload': 'Tento soubor správce trvale odstranil. Znovu ho přiložit nejde.',
  'task.filePurgeWarn': 'Odstranění nejde vrátit. Použijte ho jen pro soubor, který do aplikace nepatří (například citlivý dokument přiložený omylem).',
  'task.filePurgeReason': 'Důvod',
  'task.filePurgeDeleteFailed': 'Soubor se nepodařilo smazat ({path}). Ostatní ho přesto neotevřou. Smažte ho ručně.',
  'task.fileRemove': 'Odebrat přílohu',
  'task.linkRemove': 'Odebrat odkaz',
  'task.filePurged': 'odstraněno',
  'task.fileMissing': 'soubor zatím není synchronizován',
  'task.fileBad': 'soubor je poškozený (kontrolní součet nesouhlasí)',
  'task.fileBlocked': 'Soubory tohoto typu (HTML, SVG, XML…) nelze přiložit.',
  'task.fileTooBig': 'Soubor je větší než povolený limit {mb} MB.',
  'task.fileWarnTxt': 'Stáhne se jako text (.txt), aby se neotevřel v prohlížeči.',
  'task.assignees': 'Řešitelé',
  'task.assigneeAdd': 'Přidat řešitele',
  'task.assigneeRemove': 'Odebrat řešitele {name}',
  'task.tags': 'Štítky',
  'task.tagAdd': 'Přidat štítek',
  'task.tagNew': 'Nový štítek „{name}“',
  'task.tagRemove': 'Odebrat štítek {name}',
  'task.conversation': 'Konverzace',
  'task.history': 'Historie',
  'task.historyIntro': 'Všechny změny úkolu, nejnovější nahoře. Kliknutím na změnu zobrazíte podrobnosti. Čas je podle počítače autora.',
  'task.historyAudit': 'Zobrazit v auditu',
  'task.commentPlaceholder': 'Napsat komentář… (@jméno pro zmínku)',
  'task.commentSend': 'Odeslat',
  'task.commentEdit': 'Upravit',
  'task.commentDelete': 'Smazat',
  'task.commentDeleted': 'Komentář byl smazán.',
  'task.commentEdited': 'upraveno',
  'task.returnReason': 'Důvod vrácení',
  'task.readonly': 'Úkol je zkontrolovaný. Změny jsou možné až poté, co ho správce znovu otevře.',
  'task.notFound': 'Úkol nebyl nalezen.',
  // ---- Dialogs ----
  'dlg.new.title': 'Nový úkol',
  'dlg.new.create': 'Vytvořit',
  'dlg.done.title': 'Označit jako hotový',
  'dlg.done.open': 'Nesplněné podúkoly: {n} z {total}.',
  'dlg.done.date': 'Datum dokončení',
  'dlg.return.title': 'Vrátit k přepracování',
  'dlg.delete.title': 'Smazat úkol',
  'dlg.delete.text': 'Úkol „{title}“ se přesune do koše. Obnovit ho může jen správce.',
  'dlg.resume.title': 'Pokračovat v úkolu',
  'dlg.resume.due': 'Nový termín (nepovinný)',
  'dlg.cancel': 'Zrušit',
  // ---- Messages ----
  'msg.saved': 'Uloženo.',
  'msg.superseded': 'Změna nebyla použita, protože se úkol mezitím změnil (například jeho stav). Podrobnosti jsou v historii úkolu.',
  'msg.rejected': 'Tuto změnu nemůžete provést, nebo je neplatná.',
  'msg.error': 'Chyba: {reason}',
  'msg.writeFailed': 'Soubor se nepodařilo zapsat do sdílené složky: {reason}',
  // ---- Admin ----
  'admin.users': 'Uživatelé',
  'admin.user': 'Uživatel',
  'admin.role': 'Role',
  'admin.roleAdmin': 'správce',
  'admin.roleUser': 'uživatel',
  'admin.verifier': 'Kontroluje úkoly',
  'admin.keys': 'Klíče',
  'admin.status': 'Stav',
  'admin.active': 'aktivní',
  'admin.removed': 'odebrán(a)',
  'admin.root': 'hlavní správce',
  'admin.makeAdmin': 'Nastavit jako správce',
  'admin.makeUser': 'Odebrat práva správce',
  'admin.verifierOn': 'Povolit kontrolu úkolů',
  'admin.verifierOff': 'Zrušit kontrolu úkolů',
  'admin.remove': 'Odebrat uživatele',
  'admin.removeConfirm': 'Uživatel {name} ztratí přístup. Dosavadní změny tohoto uživatele zůstanou platné.',
  'admin.removeTasks': 'Uživatel je řešitelem v {tasks}. Odebrat ho také z řešitelů?',
  'admin.removeAlsoTasks': 'Ano, odebrat i z úkolů',
  'admin.removeOnly': 'Jen odebrat přístup',
  'admin.enroll': 'Žádosti o přístup',
  'admin.enrollNone': 'Žádné čekající žádosti.',
  'admin.enrollInvalid': 'neplatná žádost',
  'admin.enrollDone': 'již schváleno',
  'admin.enrollApprove': 'Schválit',
  'admin.enrollCompare': 'Před schválením porovnejte otisk s uživatelem (telefonem nebo osobně).',
  'admin.tags': 'Štítky',
  'admin.tagCount': 'Počet úkolů',
  'admin.tagRename': 'Přejmenovat',
  'admin.tagMerge': 'Sloučit do…',
  'admin.tagDelete': 'Smazat',
  'admin.settings': 'Nastavení',
  'admin.set.dueSoonDays': 'Upozornit na blížící se termín (dny předem)',
  'admin.set.pollSeconds': 'Interval kontroly nových změn (s)',
  'admin.set.maxAttachmentMB': 'Maximální velikost přílohy (MB)',
  'admin.set.defaultTags': 'Výchozí štítky nového úkolu',
  'admin.checkpoints': 'Kontrolní body',
  'admin.cpText': 'Kontrolní bod zrychlí první načtení na novém počítači. Soubory změn zůstávají.',
  'admin.cpCreate': 'Vytvořit kontrolní bod ({scope})',
  'admin.cpStats': '{files}, z toho {outside} mimo kontrolní body',
  'admin.trash': 'Koš',
  'admin.trashEmpty': 'Koš je prázdný.',
  'admin.deletedBy': 'Smazal(a) {name} {when}',
  'admin.audit': 'Audit',
  'admin.integrity': 'Integrita',
  'admin.integrityOk': 'Žádné problémy.',
  'admin.notAllowed': 'Tuto stránku může otevřít jen správce.',
  // ---- Labels added in the review of Phase 4 ----
  'nav.main': 'Hlavní menu',
  'filter.active': 'Aktivní filtry',
  'common.actions': 'Akce',
  'admin.keyRevoked': 'odvolán',
  'admin.keyRevoke': 'Odvolat klíč',
  'admin.keyRevokeText': 'Odvolat klíč {key} uživatele {name}? Použijte to při ztrátě nebo krádeži klíče. Změny, které klíč zapsal až dosud a které tento počítač vidí, zůstanou platné. Každá další změna s tímto klíčem bude odmítnuta.',
  'admin.keyRevokeWarn': 'Odvolání nejde vrátit. Uživatel bez dalšího klíče ztratí přístup: požádá o nový klíč a vy jeho žádost schválíte jako „Nový klíč pro uživatele“.',
  'admin.fingerprint': 'Otisk',
  'admin.enrollAs': 'Schválit jako',
  'admin.enrollNewUser': 'Nový uživatel',
  'admin.enrollNewKey': 'Nový klíč pro uživatele {name}',
  'admin.colTime': 'Čas',
  'admin.colChange': 'Změna',
  'admin.scope.roles': 'Uživatelé a nastavení',
  'admin.scope.data': 'Úkoly',
  'file.keyDescription': 'Klíč aplikace Úkoly',
  'gate.key.saveCancelled': 'Soubor s klíčem nebyl uložen. Bez něj se při ztrátě dat prohlížeče do aplikace nedostanete. Uložte ho prosím.',
  'gate.retry': 'Zkusit znovu',
  'gate.reset.button': 'Vymazat data aplikace v tomto prohlížeči',
  'gate.reset.confirm': 'Prohlížeč zapomene vybranou složku, uloženou kopii klíče a přečtená upozornění. Sdílená složka a úkoly zůstanou beze změny. Potom vyberete složku znovu a otevřete svůj soubor s klíčem. Bez souboru s klíčem budete potřebovat nový klíč a schválení správcem.',
  'gate.reset.do': 'Vymazat a načíst znovu',
  'gate.reset.failed': 'Data se nepodařilo vymazat. Zavřete ostatní karty s aplikací Úkoly. V této kartě stiskněte F12, otevřete Application → IndexedDB → mytasker (v české verzi prohlížeče mohou mít položky české názvy) a klikněte na Delete database. Potom stránku obnovte.',
  'audit.applied': 'provedeno',
  'audit.no-effect': 'beze změny',
  'audit.superseded': 'nepoužito (úkol se mezitím změnil)',
  'audit.rejected': 'odmítnuto',
  'gate.errorGeneric': 'Operace se nepodařila. Zkuste to prosím znovu.',
  'admin.tagDeleteConfirm': 'Štítek „{name}“ zmizí ze všech úkolů. Pokračovat?',
  'admin.techDetail': 'Technické podrobnosti (anglicky)',
  'issue.unknown-file': 'Neznámý soubor ve sdílené složce (například kopie při konfliktu OneDrive)',
  'issue.parse-error': 'Poškozený nebo neplatný soubor',
  'issue.misplaced': 'Soubor je na nesprávném místě',
  'issue.bad-signature': 'Neplatný podpis (soubor byl změněn, nebo ho zapsal někdo jiný)',
  'issue.unknown-key': 'Neznámý klíč (čeká na synchronizaci nebo na schválení)',
  'issue.chain-gap': 'Chybí předchozí změna (čeká na synchronizaci, nebo byl soubor smazán či změněn)',
  'issue.chain-broken': 'Přerušený řetězec změn',
  'issue.fork': 'Rozvětvení: autor má 2 různé změny se stejným pořadím',
  'issue.revoked': 'Změna po odvolání klíče',
  'issue.unauthorized': 'Změna bez oprávnění',
  'issue.invalid-payload': 'Neplatná změna',
  'issue.future-clock': 'Čas změny je v budoucnosti (špatné hodiny počítače)',
  'issue.bad-checkpoint': 'Neplatný kontrolní bod',
  'issue.domain': 'Vnitřní chyba aplikace u jedné změny',
  'advice.unknown-file': 'Ve sdílené složce je soubor, který aplikace nezná. Často je to kopie, kterou OneDrive vytvořil při konfliktu. Aplikace soubor nepoužívá. Zkontrolujte ho a pak ho ze složky odstraňte.',
  'advice.parse-error': 'Soubor změny nejde přečíst. Možná se ještě nesynchronizoval celý. Počkejte na synchronizaci. Pokud problém trvá, obnovte soubor z historie verzí OneDrive.',
  'advice.misplaced': 'Obsah souboru neodpovídá jeho umístění. Někdo soubor přesunul nebo přejmenoval. Aplikace ho nepoužije. Vraťte soubor na původní místo, nebo ho obnovte z historie verzí OneDrive.',
  'advice.bad-signature': 'Podpis nesouhlasí: soubor se po zápisu změnil. Aplikace změnu nepoužije. Obnovte původní verzi souboru z historie verzí OneDrive a zjistěte, kdo soubor upravil.',
  'advice.unknown-key': 'Klíč autora zatím není známý. Obvykle se ještě nesynchronizovalo schválení uživatele. Počkejte na synchronizaci. Pokud problém trvá, zkontrolujte žádosti o přístup.',
  'advice.chain-gap': 'Chybí některá dřívější změna autora. Obvykle OneDrive ještě nesynchronizoval všechny soubory. Počkejte. Pokud mezera trvá déle než den, obnovte chybějící soubor z koše OneDrive nebo z historie verzí OneDrive.',
  'advice.chain-broken': 'Řetězec změn autora je přerušený: některý soubor se změnil nebo byl nahrazen, nebo se řetězec rozvětvil. Aplikace pozdější změny tohoto autora nepoužije. Obnovte původní soubor z historie verzí OneDrive. Pokud má autor i rozvětvení, postupujte podle rady u rozvětvení.',
  'advice.fork': 'Autor má 2 různé změny se stejným pořadím. Možná příčina: stejný klíč na 2 počítačích najednou, nebo obnovená záloha. Pozdější změny tohoto autora se nepoužijí. Požádejte uživatele o nový klíč, schvalte jeho žádost a starý klíč odvolejte.',
  'advice.revoked': 'Změna je podepsaná klíčem, který už byl odvolán. Aplikace ji nepoužije. Ověřte, že starý klíč nepoužívá nikdo neoprávněný.',
  'advice.unauthorized': 'Autor na tuto změnu neměl oprávnění. Aplikace ji nepoužije. Možná příčina: autorovi mezitím někdo odebral oprávnění, nebo používá starší verzi aplikace. Zjistěte příčinu.',
  'advice.invalid-payload': 'Obsah změny nemá platný formát. Možná příčina: jiná verze aplikace nebo ruční úprava souboru. Aplikace změnu nepoužije. Ověřte, že všichni používají stejnou verzi aplikace.',
  'advice.future-clock': 'Čas změny je v budoucnosti: hodiny počítače autora jdou špatně. Aplikace změnu už použila. Kvůli budoucímu času může tato změna přepsat současné změny ostatních uživatelů. Zkontrolujte dotčené údaje v auditu a požádejte autora, ať si opraví nastavení hodin.',
  'advice.bad-checkpoint': 'Kontrolní bod je neplatný a aplikace ho nepoužije. Data to neohrožuje, jen se pomaleji načítají. Vytvořte nový kontrolní bod.',
  'advice.domain': 'Aplikace u této změny nahlásila vnitřní chybu. Změna se nepoužije. Pošlete technické podrobnosti technické podpoře aplikace.',
  'integrity.intro': 'Problémy jsou seřazené podle druhu. U každého druhu je popis a doporučený postup.',
  'integrity.author': 'autor',
  'integrity.more': 'a další ({n})',
  'ent.task': 'Úkol',
  'ent.subtask': 'Podúkol',
  'ent.ofTask': '(úkol {title})',
  'ent.comment': 'Komentář',
  'ent.attachment': 'Příloha',
  'ent.link': 'Odkaz',
  'ent.assignee': 'Řešitel',
  'ent.taskTag': 'Štítek',
  'ent.tag': 'Štítek',
  'ent.blob': 'Soubor',
  'ent.user': 'Uživatel',
  'ent.key': 'Klíč',
  'ent.setting': 'Nastavení',
  'audit.intro': 'Všechny změny ve sdílené složce, nejnovější nahoře. Kliknutím na změnu zobrazíte podrobnosti. Čas je podle počítače autora.',
  'audit.search': 'Hledat v auditu',
  'audit.fUser': 'Autor',
  'audit.fType': 'Změna',
  'audit.fStatus': 'Stav',
  'audit.fTask': 'Úkol',
  'audit.fTaskRemove': 'Zrušit filtr úkolu',
  'audit.any': 'vše',
  'audit.from': 'Od',
  'audit.to': 'Do',
  'audit.none': 'Žádné změny neodpovídají filtru.',
  'audit.revertOf': 'vrací změnu {id}…',
  'audit.onlyTask': 'jen tento úkol',
  'audit.notes': 'poznámky: {n}',
  'audit.scope': 'Oblast',
  'audit.scopeData': 'úkoly',
  'audit.scopeRoles': 'uživatelé a nastavení',
  'audit.key': 'klíč',
  'audit.seq': 'pořadí',
  'audit.sigOk': '✓ podpis platný',
  'audit.reason': 'Důvod (anglicky)',
  'audit.colEntity': 'Co',
  'audit.colField': 'Pole',
  'audit.colBefore': 'Před',
  'audit.colAfter': 'Po',
  'audit.payload': 'Obsah změny (technicky)',
  'revert.button': 'Vrátit',
  'revert.title': 'Vrátit změnu',
  'revert.what': 'Vrátit změnu „{what}“, kterou provedl(a) {who} {when}.',
  'revert.do': 'Vrátit změnu',
  'revert.adminOnly': 'Změnu může vrátit jen správce.',
  'revert.notApplied': 'Tato změna nebyla provedena, není co vracet.',
  'revert.notRevertible': 'Tento druh změny nejde vrátit. Použijte opačnou akci (například odebrání uživatele nebo nový klíč).',
  'revert.notPossible': 'Změnu teď nejde vrátit.',
  'revert.rejected': 'Aplikace by vrácení odmítla.',
  'revert.overwritten': 'Pozor: tato pole od té doby změnila pozdější změna. Vrácení tyto pozdější změny přepíše.',
  'revert.changed': 'Údaje se mezitím změnily. Tabulky ukazují aktuální stav. Zkontrolujte je znovu.',
  'revert.noConflict': 'Od té doby nikdo tato pole nezměnil.',
  'revert.result': 'Po vrácení budou mít pole tyto hodnoty:',
  'revert.colNow': 'Teď',
  'revert.colTarget': 'Hodnota z vracené změny',
  'revert.colNew': 'Nová hodnota',
  'footer.author': '© 2026 Lukáš Czerner',
  'footer.license': 'Licence MIT',
  'footer.licenseTitle': 'Licence',
  'footer.notices': 'Použité knihovny a jejich licence',
  'help.title': 'Nápověda',
  'help.user': 'Nápověda',
  'help.admin': 'Příručka správce',
  'help.toc': 'Obsah',
  // ---- Misc ----
  'common.yes': 'ano',
  'common.no': 'ne',
  'common.none': '—',
  'common.unknownUser': 'neznámý uživatel',
  'common.selfReported': 'čas podle počítače autora',
} as const;

export type Key = keyof typeof cs;
type Dict = Record<Key, string>;

const DICTS: Record<'cs', Dict> = { cs };
export type Lang = keyof typeof DICTS;

export function t(key: Key, params: Record<string, string | number> = {}, lang: Lang = 'cs'): string {
  const s = DICTS[lang][key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, p: string) => (p in params ? String(params[p]) : `{${p}}`));
}

export const statusLabel = (s: Status): string => t(`status.${s}` as Key);

/** Czech names of op types (history and audit). */
export const OP_LABEL: Record<string, string> = {
  GrantUser: 'Schválení uživatele', UpdateUser: 'Změna jména uživatele', SetRole: 'Změna role', SetVerifier: 'Změna práva kontroly', AddKey: 'Nový klíč', RevokeKey: 'Odvolání klíče', RemoveUser: 'Odebrání uživatele', SetSetting: 'Změna nastavení',
  CreateTask: 'Vytvoření úkolu', UpdateTask: 'Úprava úkolu', PostponeTask: 'Odložení', ResumeTask: 'Pokračování', CompleteTask: 'Dokončení', VerifyTask: 'Potvrzení kontroly', ReturnTask: 'Vrácení k přepracování', ReopenTask: 'Znovuotevření', DeleteTask: 'Smazání', RestoreTask: 'Obnovení z koše',
  AddAssignee: 'Přidání řešitele', RemoveAssignee: 'Odebrání řešitele', CreateTag: 'Nový štítek', AddTaskTag: 'Přidání štítku', RemoveTaskTag: 'Odebrání štítku', RenameTag: 'Přejmenování štítku', MergeTag: 'Sloučení štítků', DeleteTag: 'Smazání štítku',
  AddSubtask: 'Nový podúkol', EditSubtask: 'Úprava podúkolu', CheckSubtask: 'Změna splnění podúkolu', MoveSubtask: 'Přesun podúkolu', RemoveSubtask: 'Odebrání podúkolu',
  AddAttachment: 'Nová příloha', RemoveAttachment: 'Odebrání přílohy', PurgeBlob: 'Trvalé odstranění souboru', AddLink: 'Nový odkaz', EditLink: 'Úprava odkazu', RemoveLink: 'Odebrání odkazu',
  AddComment: 'Nový komentář', EditComment: 'Úprava komentáře', DeleteComment: 'Smazání komentáře', Batch: 'Více změn najednou', Revert: 'Vrácení změny',
};
export const opLabel = (type: string): string => OP_LABEL[type] ?? type;

/** Czech names of task fields (history). */
export const nFiles = (n: number) => plu(n, ['soubor změn', 'soubory změn', 'souborů změn']);
/** "1 otevřeném úkolu", "3 otevřených úkolech" (locative after "v"). */
export const nOpenTasksLoc = (n: number) => `${n} ${n === 1 ? 'otevřeném úkolu' : 'otevřených úkolech'}`;

// ---- Audit: field names and values ------------------------------------------------------------------

/** Czech field names of the audit and the history. Empty = a technical field that the UI does not show. */
export const FIELD_TEXT: Record<string, string> = {
  title: 'název', description: 'popis', status: 'stav', due: 'termín', createdAt: 'vytvořeno', createdBy: 'vytvořil(a)', completedAt: 'dokončeno', completedBy: 'dokončil(a)',
  verifiedAt: 'zkontrolováno', verifiedBy: 'zkontroloval(a)', postponedAt: 'odloženo', postponedBy: 'odložil(a)', deletedAt: 'smazáno', deletedBy: 'smazal(a)', statusBeforeDelete: 'stav před smazáním',
  text: 'text', pos: 'pořadí', done: 'splněno', doneBy: 'splnil(a)', doneAt: 'čas splnění', name: 'název', mime: 'typ', size: 'velikost', uploadedBy: 'nahrál(a)', uploadedAt: 'nahráno',
  url: 'adresa', on: 'zapnuto', by: 'změnil(a)', at: 'čas', mentions: 'zmínky', editedAt: 'upraveno', kind: 'druh', mergedInto: 'sloučeno do', purged: 'odstraněno', purgedBy: 'odstranil(a)', purgedAt: 'čas odstranění', reason: 'důvod',
  displayName: 'jméno', role: 'role', verifier: 'kontroluje úkoly', revoked: 'odvolán', cutoff: 'hranice platnosti', value: 'hodnota', sha256: 'otisk souboru',
  // Technical or derived fields: not shown.
  completeRef: '', assigneeCount: '', norm: '', order: '', taskId: '', userId: '', tagId: '', root: '', publicKey: '', alg: '',
};
/** Status values of entities other than a task. */
export const STATUS_OTHER: Record<string, string> = { active: 'aktivní', removed: 'odebráno', merged: 'sloučeno', comment: 'komentář', return: 'vrácení' };
export const AUDIT_TEXT = {
  onField: 'stav',
  assigneeOn: 'přiřazen(a)',
  assigneeOff: 'odebrán(a)',
  tagOn: 'přidán',
  tagOff: 'odebrán',
  kB: 'kB',
};

// ---- Plurals (Czech: 1 = one, 2–4 = few, 5+ and 0 = other/many) ----------------------------

const plural = new Intl.PluralRules('cs');

/** "Zobrazena 1 změna z 5", "Zobrazeny 3 změny z 5", "Zobrazeno 40 změn z 40". */
export const nShownChanges = (n: number, total: number): string => {
  const c = plural.select(n);
  return `${c === 'one' ? 'Zobrazena' : c === 'few' ? 'Zobrazeny' : 'Zobrazeno'} ${plu(n, ['změna', 'změny', 'změn'])} z ${total}`;
};
/** "Zobrazit další 1", "Zobrazit další 3", "Zobrazit dalších 200". */
export const nShowMore = (n: number): string => `Zobrazit ${plural.select(n) === 'many' || plural.select(n) === 'other' ? 'dalších' : 'další'} ${n}`;
/** "a další 1 zápis", "a další 3 zápisy", "a dalších 7 zápisů". */
export const nMoreWrites = (n: number): string => `a ${plural.select(n) === 'one' || plural.select(n) === 'few' ? 'další' : 'dalších'} ${plu(n, ['zápis', 'zápisy', 'zápisů'])}`;

/** "u 1 přílohy", "u 3 příloh" (genitive after "u"). */
export const nAttachmentsGen = (n: number): string => plu(n, ['přílohy', 'příloh', 'příloh']);

/** "1 nepřečtené", "2 nepřečtená", "5 nepřečtených". */
export const nUnread = (n: number): string => plu(n, ['nepřečtené', 'nepřečtená', 'nepřečtených']);

/** "1 úkol čeká", "2 úkoly čekají", "5 úkolů čeká" na kontrolu. */
export function nVerifyWaiting(n: number): string {
  return `${plu(n, ['úkol', 'úkoly', 'úkolů'])} ${plural.select(n) === 'few' ? 'čekají' : 'čeká'} na kontrolu`;
}

/** Czech plural forms: [one, few, many]. Example: plural(3, ['úkol', 'úkoly', 'úkolů']) → "3 úkoly". */
export function plu(n: number, forms: [string, string, string]): string {
  const c = plural.select(n);
  const w = c === 'one' ? forms[0] : c === 'few' ? forms[1] : forms[2];
  return `${n} ${w}`;
}

export const nTasks = (n: number) => plu(n, ['úkol', 'úkoly', 'úkolů']);

// ---- Dates ----------------------------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const rel = new Intl.RelativeTimeFormat('cs', { numeric: 'auto' });

/** "19. 11. 2026" (Intl gives "19. 11. 2026"; non-breaking spaces become normal spaces for stable tests). */
export const fmtDate = (iso: string): string => dateFmt.format(new Date(iso)).replace(/ /g, ' ');
export const fmtTime = (iso: string): string => timeFmt.format(new Date(iso));
/** "19. 11. 2026 14:30", or only the date for an all-day due date. */
export const fmtDateTime = (iso: string, allDay = false): string => (allDay ? fmtDate(iso) : `${fmtDate(iso)} ${fmtTime(iso)}`);

/** "za 2 dny", "před 3 hodinami", "právě teď". */
export function fmtRelative(iso: string, now: number): string {
  const d = Date.parse(iso) - now;
  if (!Number.isFinite(d)) return '';
  const a = Math.abs(d);
  const min = 60_000;
  if (a < min) return 'právě teď';
  if (a < 60 * min) return rel.format(Math.round(d / min), 'minute');
  if (a < 24 * 60 * min) return rel.format(Math.round(d / (60 * min)), 'hour');
  if (a < 30 * 24 * 60 * min) return rel.format(Math.round(d / (24 * 60 * min)), 'day');
  if (a < 365 * 24 * 60 * min) return rel.format(Math.round(d / (30 * 24 * 60 * min)), 'month');
  return rel.format(Math.round(d / (365 * 24 * 60 * min)), 'year');
}

/** The parts of an instant in Europe/Prague: { y, m, d, hh, mm }. */
export function pragueParts(iso: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: g('year'), m: g('month'), d: g('day'), hh: g('hour') % 24, mm: g('minute') };
}

/**
 * The UTC instant of a local date and time in Europe/Prague. Works across daylight saving
 * time: it starts from the UTC guess and corrects by the offset of that instant.
 */
export function pragueToIso(date: string, time: string | null): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time === null ? [23, 59, 59] : [...time.split(':').map(Number), 0];
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = pragueParts(new Date(t).toISOString());
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, ss);
    t += guess - shown;
  }
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

/** "2026-11-19" and "14:30" of an instant in Europe/Prague, for date and time inputs. */
export function isoToInputs(iso: string): { date: string; time: string } {
  const p = pragueParts(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.hh)}:${pad(p.mm)}` };
}

// ---- Sorting -------------------------------------------------------------------------------------

export const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true });
