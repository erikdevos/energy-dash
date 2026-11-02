import { useEffect, useState } from 'react';
import { Segmented } from './controls';

type Thema = 'systeem' | 'licht' | 'donker';
const KEY = 'energy-dash:thema';

function stored(): Thema {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'licht' || v === 'donker' ? v : 'systeem';
  } catch {
    return 'systeem';
  }
}

/** Kies licht of donker, of volg het apparaat. De keuze blijft op deze computer bewaard. */
export function ThemeToggle() {
  const [thema, setThema] = useState<Thema>(stored);
  useEffect(() => {
    const root = document.documentElement;
    if (thema === 'systeem') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', thema === 'licht' ? 'light' : 'dark');
    try {
      if (thema === 'systeem') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, thema);
    } catch {
      /* opslag niet beschikbaar */
    }
  }, [thema]);
  return (
    <div className="theme-toggle">
      <span>Weergave</span>
      <Segmented
        value={thema}
        options={[
          { value: 'systeem', label: 'Automatisch' },
          { value: 'licht', label: 'Licht' },
          { value: 'donker', label: 'Donker' },
        ]}
        onChange={setThema}
      />
    </div>
  );
}
