import 'leaflet/dist/leaflet.css';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { LangContext, STRINGS, type Lang, type TKey } from './i18n';
import './styles.css';

function Root() {
  const [lang, setLangState] = useState<Lang>(() =>
    localStorage.getItem('gt_lang') === 'en' ? 'en' : 'fr',
  );

  const value = useMemo(
    () => ({
      lang,
      t: (key: TKey) => STRINGS[lang][key],
      setLang: (next: Lang) => {
        localStorage.setItem('gt_lang', next);
        setLangState(next);
      },
    }),
    [lang],
  );

  // L'attribut `lang` du document suit la langue : lecture d'écran, césure et
  // correction orthographique en dépendent.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={value}>
      <App />
    </LangContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// PWA : enregistré seulement en production pour ne pas gêner le développement (HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
