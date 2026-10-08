/**
 * Abas para alternar entre listas irmas da mesma tela, como Despesas e Receitas.
 *
 * Existe em vez de reaproveitar os chips porque chip e escolha de um VALOR de
 * formulario, e aba e escolha de QUAL LISTA ver: o leitor de tela precisa ouvir
 * "aba 1 de 2", e o teclado precisa andar entre elas com as setas.
 *
 * Quem usa decide onde guardar a aba escolhida. Na tela inicial ela vive na URL,
 * para que abrir um lancamento e voltar devolva a pessoa a mesma aba.
 */

import type { KeyboardEvent } from 'react';

interface Props<T extends string> {
  abas: readonly { valor: T; rotulo: string }[];
  ativa: T;
  onChange: (valor: T) => void;
  rotulo: string;
}

export function Abas<T extends string>({ abas, ativa, onChange, rotulo }: Props<T>) {
  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const passo = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (passo === 0) return;
    evento.preventDefault();
    const alvo = abas[(indice + passo + abas.length) % abas.length];
    if (!alvo) return;
    onChange(alvo.valor);
    // O foco acompanha a aba, senao a proxima seta partiria da antiga.
    const irmaos = evento.currentTarget.parentElement?.querySelectorAll('button');
    irmaos?.[(indice + passo + abas.length) % abas.length]?.focus();
  }

  return (
    <div className="abas" role="tablist" aria-label={rotulo}>
      {abas.map((aba, indice) => (
        <button
          key={aba.valor}
          type="button"
          role="tab"
          className={'aba' + (aba.valor === ativa ? ' aba-ativa' : '')}
          aria-selected={aba.valor === ativa}
          tabIndex={aba.valor === ativa ? 0 : -1}
          onClick={() => onChange(aba.valor)}
          onKeyDown={(evento) => aoTeclar(evento, indice)}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  );
}
