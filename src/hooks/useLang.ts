import { useState, useCallback } from 'react';
import { translations, type Lang } from '../i18n/translations';

export function useLang() {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem('app_lang') as Lang) || 'en';
  });

  const t = translations[lang];

  const toggleLang = useCallback(() => {
    const next: Lang = lang === 'en' ? 'hi' : 'en';
    setLang(next);
    localStorage.setItem('app_lang', next);
  }, [lang]);

  return { lang, t, toggleLang, setLang };
}
