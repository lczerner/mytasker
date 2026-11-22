// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The language of the UI: Czech (the default) or English. localStorage keeps the choice (a view setting, ADR 0006).
import { createContext, type ComponentChildren } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { getLang, setLang as setTextLang, t, type Lang } from './i18n';

const LANG_KEY = 'mytasker.lang';

function apply(lang: Lang): void {
  setTextLang(lang);
  document.documentElement.lang = lang;
}

/** Makes the saved language the current language. Call it before the first render. */
export function initLang(): void {
  let lang: Lang = 'cs';
  try {
    if (localStorage.getItem(LANG_KEY) === 'en') lang = 'en';
  } catch {
    /* storage can be blocked (for example in an embedded page) */
  }
  apply(lang);
}

const LangCtx = createContext<{ lang: Lang; setLang(lang: Lang): void }>({ lang: 'cs', setLang: () => undefined });

/**
 * Holds the language. A change renders each component that calls `useLang()` again, with its subtree.
 * The components stay mounted: no state (for example unsaved text) is lost.
 */
export function LangProvider({ children }: { children: ComponentChildren }) {
  const [lang, setState] = useState<Lang>(getLang);
  const setLang = (l: Lang) => {
    apply(l); // before the render: t() reads the current language
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* the choice stays for this page only */
    }
    setState(l);
  };
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

/** The button that changes the language: "English" in Czech, "Česky" in English. */
export function LangButton({ small }: { small?: boolean }) {
  const { lang, setLang } = useLang();
  const other: Lang = lang === 'cs' ? 'en' : 'cs';
  return (
    <button type="button" class={small ? 'link small' : 'link'} lang={other} onClick={() => setLang(other)}>
      {t('lang.switch')}
    </button>
  );
}
