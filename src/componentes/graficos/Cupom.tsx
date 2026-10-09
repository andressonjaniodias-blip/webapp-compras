/**
 * O gasto por categoria como um CUPOM: a pizza no alto, e embaixo as linhas com o
 * pontilhado que liga o nome ao valor, a regua tracejada e o total. A borda de
 * baixo e serrilhada, como o papel que sai da maquina.
 *
 * Duas coisas que vieram das barras que isto substitui (`Fatias`, no Resumo):
 *
 * - TETO. Sao 17 categorias possiveis, e uma pizza de 17 fatias nao se le. Ficam
 *   as quatro maiores e o resto vira "Outras", que ao tocar abre as categorias que
 *   guarda — nenhum numero fica sem caminho ate a compra que o formou.
 * - A COMPRA POR TRAS DO NUMERO. Resumo em que nao se pode entrar e resumo que se
 *   para de conferir: tocar numa linha abre as compras que somam aquele valor.
 *
 * A pizza nao carrega significado sozinha. A cor separa as fatias; quem as
 * identifica e a lista ao lado, com nome, valor e percentual. Tocar numa fatia ou
 * numa linha destaca a mesma categoria nos dois.
 */

import { useId, useState } from 'react';
import type { FatiaResumo } from '../../lib/resumo';
import { formatarData } from '../../lib/datas';
import { formatarReais, formatarReaisCurto } from '../../lib/dinheiro';

/** As fatias que aparecem sozinhas. Passando disso, as menores viram "Outras". */
const FATIAS_SOLTAS = 4;

interface Entrada {
  chave: string;
  nome: string;
  total: number;
  percentual: number;
  delta: number | null;
  /** As compras que somam o total. Vazio em "Outras": as compras estao nas filhas. */
  compras: FatiaResumo['compras'];
  filhas: readonly FatiaResumo[];
}

function entradasDe(fatias: readonly FatiaResumo[]): Entrada[] {
  // Ate cinco categorias cabem todas; de seis em diante, as quatro maiores e "Outras".
  const naoPrecisaAgrupar = fatias.length <= FATIAS_SOLTAS + 1;
  const proprias = naoPrecisaAgrupar ? fatias : fatias.slice(0, FATIAS_SOLTAS);

  const soltas: Entrada[] = proprias.map((f) => ({
    chave: f.nome,
    nome: f.nome,
    total: f.total,
    percentual: f.percentual,
    delta: f.delta,
    compras: f.compras,
    filhas: [],
  }));

  const resto = fatias.slice(proprias.length);
  if (resto.length === 0) return soltas;

  return [
    ...soltas,
    {
      chave: '\u0000outras',
      nome: 'Outras',
      total: resto.reduce((soma, f) => soma + f.total, 0),
      percentual: resto.reduce((soma, f) => soma + f.percentual, 0),
      delta: null,
      compras: [],
      filhas: resto,
    },
  ];
}

const RAIO_FORA = 84;
const RAIO_DENTRO = 56;
const CENTRO = 90;

function ponto(raio: number, angulo: number): string {
  return `${(CENTRO + raio * Math.cos(angulo)).toFixed(2)} ${(CENTRO + raio * Math.sin(angulo)).toFixed(2)}`;
}

function caminhoDaFatia(inicio: number, fim: number): string {
  // Uma fatia que e a pizza inteira nao tem como ser um arco: o ponto final seria
  // o inicial, e o SVG desenharia nada. Vira duas meias-voltas.
  const volta = fim - inicio;
  if (volta >= Math.PI * 2 - 0.001) {
    return (
      `M${ponto(RAIO_FORA, inicio)} A${RAIO_FORA} ${RAIO_FORA} 0 1 1 ${ponto(RAIO_FORA, inicio + Math.PI)}` +
      ` A${RAIO_FORA} ${RAIO_FORA} 0 1 1 ${ponto(RAIO_FORA, inicio)}` +
      ` M${ponto(RAIO_DENTRO, inicio)} A${RAIO_DENTRO} ${RAIO_DENTRO} 0 1 0 ${ponto(RAIO_DENTRO, inicio + Math.PI)}` +
      ` A${RAIO_DENTRO} ${RAIO_DENTRO} 0 1 0 ${ponto(RAIO_DENTRO, inicio)}Z`
    );
  }
  const grande = volta > Math.PI ? 1 : 0;
  return (
    `M${ponto(RAIO_FORA, inicio)} A${RAIO_FORA} ${RAIO_FORA} 0 ${grande} 1 ${ponto(RAIO_FORA, fim)}` +
    ` L${ponto(RAIO_DENTRO, fim)} A${RAIO_DENTRO} ${RAIO_DENTRO} 0 ${grande} 0 ${ponto(RAIO_DENTRO, inicio)}Z`
  );
}

/** A borda serrilhada: dentes para baixo, na largura toda. */
function caminhoDaSerra(dentes: number): { cheio: string; borda: string } {
  const passo = 300 / dentes;
  let cheio = 'M0 0H300V6';
  let borda = 'M0 0V6';
  for (let k = dentes; k > 0; k -= 1) {
    cheio += `L${((k - 0.5) * passo).toFixed(2)} 12L${((k - 1) * passo).toFixed(2)} 6`;
  }
  for (let k = 1; k <= dentes; k += 1) {
    borda += `L${((k - 0.5) * passo).toFixed(2)} 12L${(k * passo).toFixed(2)} 6`;
  }
  borda += 'V0';
  return { cheio: cheio + 'Z', borda };
}

const SERRA = caminhoDaSerra(24);

export function Cupom({
  fatias,
  total,
  rotuloDoTotal,
  mostrarDelta,
  abrirCompra,
}: {
  fatias: readonly FatiaResumo[];
  total: number;
  /** "Comprei em outubro". */
  rotuloDoTotal: string;
  /** Falso no mes em curso: o delta contra o mes anterior INTEIRO enganaria. */
  mostrarDelta: boolean;
  abrirCompra: (id: string) => void;
}) {
  const idDoGrafico = useId();
  const entradas = entradasDe(fatias);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const soma = entradas.reduce((s, e) => s + e.total, 0) || 1;
  let angulo = -Math.PI / 2;
  const desenho = entradas.map((entrada, i) => {
    const volta = (entrada.total / soma) * Math.PI * 2;
    const inicio = angulo + 0.012;
    const fim = angulo + volta - 0.012;
    angulo += volta;
    return { entrada, indice: i, d: caminhoDaFatia(inicio, Math.max(inicio + 0.001, fim)) };
  });

  function tocar(chave: string) {
    setEscolhida((atual) => (atual === chave ? null : chave));
    setAberta((atual) => (atual === chave ? null : chave));
  }

  const destaque = entradas.find((e) => e.chave === escolhida) ?? null;

  return (
    <div className="cupom">
      <div className="cupom-corpo">
        <div className="cupom-pizza">
          <svg
            viewBox="0 0 180 180"
            role="img"
            aria-labelledby={idDoGrafico}
          >
            <title id={idDoGrafico}>
              {rotuloDoTotal}: {formatarReais(total)}. Maior categoria: {entradas[0]?.nome} com{' '}
              {Math.round(entradas[0]?.percentual ?? 0)}%.
            </title>
            {desenho.map(({ entrada, indice, d }) => (
              <path
                key={entrada.chave}
                className="gr-toque gr-foco gr-contorno"
                d={d}
                fill={`var(--fatia-${indice + 1})`}
                tabIndex={0}
                role="button"
                aria-label={`${entrada.nome}: ${formatarReais(entrada.total)}, ${Math.round(entrada.percentual)}%`}
                style={{ opacity: escolhida === null || escolhida === entrada.chave ? 1 : 0.3 }}
                onClick={() => tocar(entrada.chave)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tocar(entrada.chave);
                  }
                }}
              />
            ))}
            <text className="gr-texto" x={CENTRO} y="85" textAnchor="middle">
              {destaque ? destaque.nome : 'comprei'}
            </text>
            <text className="gr-texto gr-forte" x={CENTRO} y="105" textAnchor="middle" style={{ fontSize: 17 }}>
              {formatarReaisCurto(destaque ? destaque.total : total)}
            </text>
          </svg>
        </div>

        <ul className="lista">
          {entradas.map((entrada, i) => (
            <li key={entrada.chave}>
              <button
                type="button"
                className="cupom-linha"
                aria-expanded={aberta === entrada.chave}
                style={{ opacity: escolhida === null || escolhida === entrada.chave ? 1 : 0.5 }}
                onClick={() => tocar(entrada.chave)}
              >
                <i style={{ background: `var(--fatia-${i + 1})` }} />
                <span className="cupom-nome">{entrada.nome}</span>
                <span className="cupom-pontos" />
                <span className="cupom-valor">{formatarReais(entrada.total)}</span>
                <span className="cupom-pct">{Math.round(entrada.percentual)}%</span>
              </button>

              {mostrarDelta && entrada.delta !== null && entrada.delta !== 0 && (
                <span className={'cupom-delta ' + (entrada.delta > 0 ? 'subiu' : 'caiu')}>
                  {entrada.delta > 0 ? '▲' : '▼'} {formatarReais(Math.abs(entrada.delta))} contra o mês
                  anterior
                </span>
              )}

              {aberta === entrada.chave && entrada.filhas.length > 0 && (
                <ul className="lista cupom-compras">
                  {entrada.filhas.map((filha) => (
                    <FilhaDeOutras
                      key={filha.nome}
                      fatia={filha}
                      mostrarDelta={mostrarDelta}
                      abrirCompra={abrirCompra}
                    />
                  ))}
                </ul>
              )}

              {aberta === entrada.chave && entrada.filhas.length === 0 && (
                <ComprasDaFatia compras={entrada.compras} abrirCompra={abrirCompra} />
              )}
            </li>
          ))}
        </ul>

        <div className="cupom-total">
          <span>Total</span>
          <span>{formatarReais(total)}</span>
        </div>
      </div>

      <svg className="cupom-serra" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
        <path className="cheio" d={SERRA.cheio} />
        <path className="borda" d={SERRA.borda} />
      </svg>
    </div>
  );
}

/** Uma categoria dentro de "Outras": uma linha que abre as proprias compras. */
function FilhaDeOutras({
  fatia,
  mostrarDelta,
  abrirCompra,
}: {
  fatia: FatiaResumo;
  mostrarDelta: boolean;
  abrirCompra: (id: string) => void;
}) {
  const [aberta, setAberta] = useState(false);
  return (
    <li>
      <button
        type="button"
        className="cupom-linha"
        aria-expanded={aberta}
        onClick={() => setAberta((a) => !a)}
      >
        <span className="cupom-nome">{fatia.nome}</span>
        <span className="cupom-pontos" />
        <span className="cupom-valor">{formatarReais(fatia.total)}</span>
        <span className="cupom-pct">{Math.round(fatia.percentual)}%</span>
      </button>
      {mostrarDelta && fatia.delta !== null && fatia.delta !== 0 && (
        <span className={'cupom-delta ' + (fatia.delta > 0 ? 'subiu' : 'caiu')}>
          {fatia.delta > 0 ? '▲' : '▼'} {formatarReais(Math.abs(fatia.delta))} contra o mês anterior
        </span>
      )}
      {aberta && <ComprasDaFatia compras={fatia.compras} abrirCompra={abrirCompra} />}
    </li>
  );
}

function ComprasDaFatia({
  compras,
  abrirCompra,
}: {
  compras: FatiaResumo['compras'];
  abrirCompra: (id: string) => void;
}) {
  return (
    <ul className="lista cupom-compras">
      {compras
        .slice()
        .sort((a, b) => b.total - a.total)
        .map((compra) => (
          <li key={compra.id}>
            <button type="button" className="compra" onClick={() => abrirCompra(compra.id)}>
              <div className="compra-corpo">
                <div className="compra-titulo">
                  {compra.descricao || compra.categoria || 'sem descrição'}
                </div>
                <div className="compra-meta">{formatarData(compra.data)}</div>
              </div>
              <span className="compra-valor">{formatarReais(compra.total)}</span>
            </button>
          </li>
        ))}
    </ul>
  );
}
