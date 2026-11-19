// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Information bar: app name, version, author and license (the license text is in the bundle).
import { useState } from "preact/hooks";
import LICENSE from "../../LICENSE?raw";
import { t } from "./i18n";
import { Dialog } from "./widgets";

const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
const COMMIT = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "dev";

export function Footer() {
  const [open, setOpen] = useState(false);
  // The dialog is outside the footer: inside, it would inherit the small font of the bar.
  return (
    <>
      <footer class="footer">
        <span>
          {t("appName")} {VERSION} <span class="muted">({COMMIT})</span>
        </span>
        <span aria-hidden="true" class="footer-opt">
          ·
        </span>
        <span class="footer-opt">{t("footer.author")}</span>
        <span aria-hidden="true">·</span>
        <button type="button" class="link" onClick={() => setOpen(true)}>
          {t("footer.license")}
        </button>
      </footer>
      {open && (
        <Dialog
          title={t("footer.licenseTitle")}
          onClose={() => setOpen(false)}
          wide
        >
          <pre class="license">{LICENSE}</pre>
          <div class="row end">
            <button
              type="button"
              class="primary"
              autoFocus
              onClick={() => setOpen(false)}
            >
              {t("task.close")}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
