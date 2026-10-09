/**
 * "‹ outubro de 2026 ›": duas setas grandes com o mes no meio.
 *
 * E o navegador que o Resumo ja tinha, extraido para as listas usarem o mesmo.
 * Uma lista que mostra todos os meses um depois do outro vira, em um ano, uma
 * rolagem sem fim; por mes, achar "aquela compra de julho" e um toque.
 *
 * `meses` vem do mais recente para o mais antigo, entao "anterior" e o proximo
 * indice. Seta desabilitada nas pontas, nao escondida: o botao nao muda de lugar.
 */

import { nomeMes } from '../lib/datas';

interface Props {
  meses: readonly string[];
  mes: string;
  onChange: (mes: string) => void;
}

export function NavegadorDeMes({ meses, mes, onChange }: Props) {
  const indice = meses.indexOf(mes);

  return (
    <div className="mes-navegador">
      <button
        type="button"
        className="botao-icone"
        aria-label="Mês anterior"
        disabled={indice < 0 || indice >= meses.length - 1}
        onClick={() => onChange(meses[indice + 1]!)}
      >
        ‹
      </button>
      <strong>{nomeMes(mes)}</strong>
      <button
        type="button"
        className="botao-icone"
        aria-label="Mês seguinte"
        disabled={indice <= 0}
        onClick={() => onChange(meses[indice - 1]!)}
      >
        ›
      </button>
    </div>
  );
}
