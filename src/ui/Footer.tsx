// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Information bar: app name, version, author, license and help (the texts are in the bundle).
import { useState } from 'preact/hooks';
import LICENSE from '../../LICENSE?raw';
import NOTICES from '../../THIRD-PARTY-NOTICES.md?raw';
import { HelpDialog } from './Help';
import { t as translate, type Lang, type StartKey } from './i18n';
import { Dialog } from './widgets';

const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev';

/**
 * `helpHref`: in the app, the help is a page. Without it (start screens), the help opens in a dialog.
 * `lang`: the language of the start screens (the app is in Czech only).
 */
export function Footer({ helpHref, lang = 'cs' }: { helpHref?: string; lang?: Lang }) {
  const t = (k: StartKey) => translate(k, {}, lang);
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  // The dialogs are outside the footer: inside, they would inherit the small font of the bar.
  return (
    <>
      <footer class="footer">
        <span>
          {t('appName')} {VERSION} <span class="muted">({COMMIT})</span>
        </span>
        <span aria-hidden="true" class="footer-opt">
          ·
        </span>
        <span class="footer-opt">{t('footer.author')}</span>
        <span aria-hidden="true">·</span>
        <button type="button" class="link" onClick={() => setOpen(true)}>
          {t('footer.license')}
        </button>
        <span aria-hidden="true">·</span>
        {helpHref ? (
          <a href={helpHref}>{t('help.user')}</a>
        ) : (
          <button type="button" class="link" onClick={() => setHelp(true)}>
            {t('help.user')}
          </button>
        )}
      </footer>
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {open && (
        <Dialog title={t('footer.licenseTitle')} onClose={() => setOpen(false)} wide>
          <pre class="license">{LICENSE}</pre>
          <h3>{t('footer.notices')}</h3>
          <pre class="license">{NOTICES}</pre>
          <div class="row end">
            <button type="button" class="primary" autoFocus onClick={() => setOpen(false)}>
              {t('task.close')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
