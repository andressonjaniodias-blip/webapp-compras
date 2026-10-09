/**
 * O saldo em conta previsto, mes a mes: a trajetoria em vez da tabela.
 *
 * E o desenho que responde "cabe no mes?". Cada ponto e o `saldoAcumulado` de um
 * mes (`LinhaPrevisao`), com a forma do estado dele (cabe, aperta, estoura) pela
 * MESMA regra do veredito do simulador (`estadoDoSaldo` e `folgaDe`). A area
 * abaixo do zero e a que importa, e fica de vermelho.
 *
 * O PLANO GRATIS segue a tabela (`TabelaPrevisao`): os meses alem de `visiveis`
 * nao ganham ponto, so uma faixa dizendo que existem. O mes critico continua
 * NOMEADO, sem valor — a pessoa fica sabendo que ha um aperto e nao o tamanho
 * dele. O calculo e real; nao ha escassez inventada, so um numero nao lido.
 *
 * Com `referencia`, uma segunda trajetoria tracejada: no simulador, o saldo SEM a
 * compra, para ver o que ela muda.
 */

import { useId, useState } from 'react';
import type { LinhaPrevisao } from '../../../compartilhado/previsao';
import { formatarReais } from '../../lib/dinheiro';
import { nomeMes } from '../../lib/datas';
import { estadoDoSaldo } from '../../lib/series';
import { escalaLinear } from './escala';
import { MarcadorDeEstado, SeloDeEstado } from './Estado';

const LARGURA = 300;
const ALTURA = 190;
const MARGEM_X = 10;
const TOPO = 18;
const RODAPE = 26;

const curto = (mes: string) => nomeMes(mes).split(' ')[0]!.slice(0, 3);
const inteiro = (mes: string) => nomeMes(mes).split(' ')[0]!;

export function LinhaSaldo({
  linhas,
  visiveis,
  folga,
  maisApertado,
  referencia,
  rotuloReferencia = 'sem a compra',
}: {
  linhas: readonly LinhaPrevisao[];
  /** Quantos meses mostram valor. Os demais so existem como nome. */
  visiveis: number;
  /** `folgaDe(estimativa)`: abaixo disso e "aperta". */
  folga: number;
  maisApertado: LinhaPrevisao | null;
  referencia?: readonly LinhaPrevisao[];
  rotuloReferencia?: string;
}) {
  // Dois graficos na mesma pagina nao podem dividir o id do recorte.
  const id = useId().replace(/:/g, '');
  const aMostrar = linhas.slice(0, visiveis);
  const apertadoVisivel = maisApertado !== null && aMostrar.some((l) => l.mes === maisApertado.mes);
  const indiceDoApertado = apertadoVisivel ? aMostrar.findIndex((l) => l.mes === maisApertado!.mes) : -1;
  const [escolhido, setEscolhido] = useState(indiceDoApertado >= 0 ? indiceDoApertado : 0);

  if (aMostrar.length < 2) return null;

  const todos = [
    ...aMostrar.map((l) => l.saldoAcumulado),
    ...(referencia ?? []).slice(0, visiveis).map((l) => l.saldoAcumulado),
    0,
  ];
  const menor = Math.min(...todos);
  const maior = Math.max(...todos);
  const folgaVertical = (maior - menor) * 0.08 || 1;

  const x = escalaLinear(0, Math.max(1, linhas.length - 1), MARGEM_X, LARGURA - MARGEM_X);
  const y = escalaLinear(menor - folgaVertical, maior + folgaVertical, ALTURA - RODAPE, TOPO);
  const y0 = y(0);

  const trajeto = (lista: readonly LinhaPrevisao[]) =>
    lista
      .slice(0, visiveis)
      .map((l, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(l.saldoAcumulado).toFixed(1)}`)
      .join('');

  const caminho = trajeto(linhas);
  const ultimoX = x(aMostrar.length - 1);
  const area = `${caminho}L${ultimoX.toFixed(1)} ${y0.toFixed(1)}L${x(0).toFixed(1)} ${y0.toFixed(1)}Z`;

  const atual = aMostrar[escolhido] ?? aMostrar[0]!;
  const estadoAtual = estadoDoSaldo(atual.saldoAcumulado, folga);
  const ehApertado = maisApertado !== null && atual.mes === maisApertado.mes;

  const resumo =
    maisApertado === null
      ? 'Saldo em conta previsto, mês a mês.'
      : apertadoVisivel
        ? `Saldo em conta previsto, mês a mês. O mês mais apertado é ${inteiro(maisApertado.mes)}, com ${formatarReais(maisApertado.saldoAcumulado)}.`
        : `Saldo em conta previsto, mês a mês. O aperto está em ${inteiro(maisApertado.mes)}, no plano pago.`;

  return (
    <figure className="grafico">
      <figcaption className="grafico-leitura" aria-live="polite">
        <strong>{inteiro(atual.mes)}</strong> fecha com{' '}
        <span className="valor">{formatarReais(atual.saldoAcumulado)}</span>.{' '}
        <SeloDeEstado estado={estadoAtual} />
        {ehApertado && ' É o mês mais apertado.'}
        {!apertadoVisivel && maisApertado !== null && (
          <>
            <br />O aperto está em <strong>{inteiro(maisApertado.mes)}</strong>, no plano pago.
          </>
        )}
      </figcaption>

      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" aria-label={resumo}>
        <defs>
          <clipPath id={id + 'abaixo'}>
            <rect x="0" y={y0} width={LARGURA} height={ALTURA} />
          </clipPath>
          <clipPath id={id + 'acima'}>
            <rect x="0" y="0" width={LARGURA} height={y0} />
          </clipPath>
        </defs>

        <path className="gr-area-ruim" d={area} clipPath={`url(#${id}abaixo)`} />
        <path className="gr-area-boa" d={area} clipPath={`url(#${id}acima)`} />

        <line className="gr-regua" x1={MARGEM_X} y1={y0} x2={LARGURA - MARGEM_X} y2={y0} />
        <text className="gr-texto" x={LARGURA - MARGEM_X} y={y0 - 5} textAnchor="end">
          R$ 0
        </text>

        {linhas.length > aMostrar.length && (
          <g>
            <rect
              className="gr-futuro"
              x={ultimoX + 8}
              y={TOPO}
              width={LARGURA - MARGEM_X - ultimoX - 8}
              height={ALTURA - RODAPE - TOPO}
              strokeDasharray="4 4"
            />
            <text
              className="gr-texto"
              x={(ultimoX + 8 + LARGURA - MARGEM_X) / 2}
              y={(TOPO + ALTURA - RODAPE) / 2}
              textAnchor="middle"
            >
              plano pago
            </text>
          </g>
        )}

        {referencia && (
          <path className="gr-linha-fraca" d={trajeto(referencia)} />
        )}
        <path className="gr-linha" d={caminho} />

        {aMostrar.map((l, i) => (
          <g
            key={l.mes}
            className="gr-toque"
            tabIndex={0}
            role="button"
            aria-label={`${inteiro(l.mes)}: ${formatarReais(l.saldoAcumulado)}`}
            onClick={() => setEscolhido(i)}
            onFocus={() => setEscolhido(i)}
          >
            <MarcadorDeEstado estado={estadoDoSaldo(l.saldoAcumulado, folga)} x={x(i)} y={y(l.saldoAcumulado)} />
            <circle cx={x(i)} cy={y(l.saldoAcumulado)} r="15" fill="transparent" />
          </g>
        ))}

        {linhas.map((l, i) => (
          <text
            key={l.mes}
            className={'gr-texto' + (i === escolhido ? ' gr-forte' : '')}
            x={x(i)}
            y={ALTURA - 8}
            textAnchor="middle"
            fillOpacity={i < visiveis ? 1 : 0.5}
          >
            {curto(l.mes)}
          </text>
        ))}
      </svg>

      {referencia && (
        <ul className="grafico-legenda">
          <li>Linha cheia: com a compra</li>
          <li>Tracejada: {rotuloReferencia}</li>
        </ul>
      )}
    </figure>
  );
}
