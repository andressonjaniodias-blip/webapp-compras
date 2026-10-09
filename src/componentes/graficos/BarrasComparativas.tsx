/**
 * Este mes contra o anterior, categoria a categoria: duas barras por linha e a
 * diferenca escrita ao lado.
 *
 * A comparacao e NO MESMO PERIODO (`compararNoMesmoPeriodo`): no dia 9, os nove
 * primeiros dias deste mes contra os nove primeiros do anterior. Mes em curso
 * contra mes anterior inteiro perde sempre, e uma barra que diz "▼ 70%" por
 * isso e uma barra que mente. Quem sabe o corte e a funcao; aqui so se desenha, e
 * a frase do titulo diz de onde a conta vem.
 *
 * ▲ gastou mais e ▼ gastou menos, com a forma e o sinal na frente: a cor sozinha
 * nao diria nada a quem nao distingue verde de vermelho.
 */

import { formatarReais, formatarReaisCurto } from '../../lib/dinheiro';
import type { Comparacao } from '../../lib/series';
import { escalaLinear } from './escala';

const LARGURA = 300;
const ALTURA_DA_LINHA = 62;
const RESERVA_DO_VALOR = 76;

export function BarrasComparativas({
  comparacao,
  nomeAtual,
  nomeAnterior,
}: {
  comparacao: Comparacao;
  nomeAtual: string;
  nomeAnterior: string;
}) {
  const { linhas } = comparacao;
  const maior = Math.max(...linhas.flatMap((l) => [l.atual, l.anterior]), 1);
  const x = escalaLinear(0, maior, 0, LARGURA - RESERVA_DO_VALOR);
  const altura = linhas.length * ALTURA_DA_LINHA + 4;

  const resumo = linhas
    .map((l) => `${l.nome}: ${formatarReais(l.atual)} contra ${formatarReais(l.anterior)}`)
    .join('. ');

  return (
    <figure className="grafico">
      <ul className="grafico-legenda" style={{ marginTop: 0, marginBottom: 10 }}>
        <li><i style={{ background: 'var(--serie-3)' }} />{nomeAnterior}</li>
        <li><i style={{ background: 'var(--serie-1)' }} />{nomeAtual}</li>
      </ul>

      <svg viewBox={`0 0 ${LARGURA} ${altura}`} role="img" aria-label={`${nomeAtual} contra ${nomeAnterior}. ${resumo}.`}>
        {linhas.map((linha, i) => {
          const topo = i * ALTURA_DA_LINHA + 2;
          const diferenca = linha.atual - linha.anterior;
          const classeDoDelta = diferenca > 0 ? 'subiu' : diferenca < 0 ? 'caiu' : '';
          const larguraAnterior = Math.max(linha.anterior > 0 ? 3 : 0, x(linha.anterior));
          const larguraAtual = Math.max(linha.atual > 0 ? 3 : 0, x(linha.atual));

          return (
            <g key={linha.nome}>
              <text
                x="0"
                y={topo + 13}
                style={{ fontFamily: 'var(--fonte)', fontSize: 14, fontWeight: 600, fill: 'var(--texto)' }}
              >
                {linha.nome}
              </text>
              <text className={'gr-texto gr-forte ' + classeDoDelta} x={LARGURA} y={topo + 13} textAnchor="end">
                {diferenca === 0 ? 'igual' : `${diferenca > 0 ? '▲' : '▼'} ${formatarReaisCurto(Math.abs(diferenca))}`}
              </text>

              <rect className="gr-contorno gr-serie-3" x="0.75" y={topo + 21} width={Math.max(0, larguraAnterior - 1.5)} height="11" />
              <text className="gr-texto" x={larguraAnterior + 6} y={topo + 30}>
                {formatarReaisCurto(linha.anterior)}
              </text>

              <rect className="gr-contorno gr-serie-1" x="0.75" y={topo + 36} width={Math.max(0, larguraAtual - 1.5)} height="11" />
              <text className="gr-texto gr-forte" x={larguraAtual + 6} y={topo + 45}>
                {formatarReaisCurto(linha.atual)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
