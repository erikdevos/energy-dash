import { createElement, Fragment, type ReactNode } from 'react';

/*
 * Lopende tekst waarin bedragen (€ 1.234) en verbruik (2.440 kWh, 1,7 kW) als pill worden getoond.
 * Alleen losse tekst wordt bewerkt; elementen in de kinderen blijven ongemoeid.
 */
const VALUE = /(€\s?-?\d[\d.,]*|-?\d[\d.,]*\s?(?:kWh|kW)\b)/g;

function pills(text: string): ReactNode[] {
  return text.split(VALUE).map((part, i) => {
    if (i % 2 === 0) return part;
    const kind = part.startsWith('€') ? 'eur' : 'kwh';
    return (
      <span key={i} className={`val val-${kind}`}>
        {part.replace(/\s+/, ' ')}
      </span>
    );
  });
}

function walk(node: ReactNode): ReactNode {
  if (typeof node === 'string') return <Fragment>{pills(node)}</Fragment>;
  if (Array.isArray(node)) return node.map((n, i) => <Fragment key={i}>{walk(n)}</Fragment>);
  return node;
}

export function Rich({ as = 'span', children, ...rest }: { as?: 'p' | 'span' | 'div'; children?: ReactNode; className?: string; id?: string }) {
  return createElement(as, rest, walk(children));
}
