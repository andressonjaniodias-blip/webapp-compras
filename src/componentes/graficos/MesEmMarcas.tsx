/**
 * O mes em 31 marcas: uma por dia, do dia 1 ao ultimo.
 *
 * E o desenho que so este app tem. O mes e a unidade do produto ("abrir o app e
 * saber em dois segundos como o mes esta"), e uma marca por dia mostra isso sem
 * explicar: as altas sao os dias de mercado, as baixinhas o dia a dia, e os dias
 * que ainda nao chegaram ficam em contorno, esperando. A linha tracejada e o
 * ritmo normal por dia.
 *
 * O toque, e o arrastar, escolhem o dia e escrevem o valor na linha de cima. 31
 * marcas em 340px dao 11px por dia: nenhuma e alvo de 48px, entao o alvo e o
 * desenho inteiro e o dia sai da posicao do dedo.
 */

import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatarReais, formatarReaisCurto } from '../../lib/dinheiro';
import { escalaLinear } from './escala';

const LARGURA = 300;
const ALTURA = 96;
const TOPO = 16;
const BASE = ALTURA - 18;
const LARGURA_MARCA = 6;

export function MesEmMarcas({
  dias,
  diaDeHoje,
  ritmoPorDia,
}: {
  /** O gasto de cada dia do mes, em centavos. */
  dias: readonly number[];
  /** De 1 ao ultimo dia. */
  diaDeHoje: number;
  /** O gasto normal por dia. `null` sem base para dizer o que e normal. */
  ritmoPorDia: number | null;
}) {
  const [escolhido, setEscolhido] = useState(diaDeHoje);

  const total = dias.length;
  const fatia = LARGURA / total;
  const maior = Math.max(...dias, (ritmoPorDia ?? 0) * 1.2, 1);
  const y = escalaLinear(0, maior, BASE, TOPO);
  const diaDoMaior = dias.indexOf(Math.max(...dias));
  const gastoDoMaior = dias[diaDoMaior] ?? 0;

  function diaDaPosicao(evento: PointerEvent<SVGSVGElement>): number {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const fracao = (evento.clientX - caixa.left) / Math.max(1, caixa.width);
    return Math.min(total, Math.max(1, Math.floor(fracao * total) + 1));
  }

  function aoTeclar(evento: KeyboardEvent<SVGSVGElement>) {
    if (evento.key === 'ArrowRight') setEscolhido((d) => Math.min(total, d + 1));
    else if (evento.key === 'ArrowLeft') setEscolhido((d) => Math.max(1, d - 1));
    else return;
    evento.preventDefault();
  }

  const valorDoEscolhido = dias[escolhido - 1] ?? 0;
  const titulo = escolhido === diaDeHoje ? `Hoje, dia ${escolhido}` : `Dia ${escolhido}`;
  const leitura =
    escolhido > diaDeHoje ? (
      <>
        <strong>Dia {escolhido}</strong>: ainda não chegou.
      </>
    ) : (
      <>
        <strong>{titulo}</strong>:{' '}
        {valorDoEscolhido > 0 ? (
          <span className="valor">{formatarReais(valorDoEscolhido)}</span>
        ) : (
          'nenhum gasto do dia a dia.'
        )}
      </>
    );

  return (
    <figure className="grafico">
      <figcaption className="grafico-leitura" aria-live="polite">
        {leitura}
      </figcaption>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        tabIndex={0}
        aria-label={
          `Gasto do dia a dia em cada um dos ${total} dias do mês. ` +
          `O maior foi o dia ${diaDoMaior + 1}, com ${formatarReais(gastoDoMaior)}.` +
          (ritmoPorDia !== null ? ` O normal é ${formatarReais(ritmoPorDia)} por dia.` : '') +
          ' Use as setas para mudar de dia.'
        }
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => setEscolhido(diaDaPosicao(e))}
        onPointerMove={(e) => e.buttons > 0 && setEscolhido(diaDaPosicao(e))}
        onKeyDown={aoTeclar}
      >
        <rect
          className="gr-serie-3"
          x={(escolhido - 1) * fatia}
          y="0"
          width={fatia}
          height={BASE}
          fillOpacity="0.45"
        />

        {ritmoPorDia !== null && (
          <line className="gr-regua" x1="0" y1={y(ritmoPorDia)} x2={LARGURA} y2={y(ritmoPorDia)} />
        )}

        {dias.map((valor, i) => {
          const x = i * fatia + (fatia - LARGURA_MARCA) / 2;
          if (i + 1 > diaDeHoje) {
            return (
              <rect
                key={i}
                className="gr-futuro"
                x={x + 0.75}
                y={BASE - 12}
                width={LARGURA_MARCA - 1.5}
                height="12"
              />
            );
          }
          if (valor <= 0) {
            return <rect key={i} className="gr-serie-1" x={x} y={BASE - 2} width={LARGURA_MARCA} height="2" />;
          }
          return (
            <rect
              key={i}
              className="gr-contorno gr-serie-2"
              x={x}
              y={y(valor)}
              width={LARGURA_MARCA}
              height={BASE - y(valor)}
              strokeWidth="1.25"
            />
          );
        })}

        <line className="gr-eixo" x1="0" y1={BASE} x2={LARGURA} y2={BASE} />

        {gastoDoMaior > 0 && gastoDoMaior > (ritmoPorDia ?? 0) * 2 && (
          <text
            className="gr-texto gr-forte"
            x={Math.min(LARGURA, diaDoMaior * fatia + fatia / 2 + 28)}
            y={y(gastoDoMaior) - 4}
            textAnchor="end"
          >
            {formatarReaisCurto(gastoDoMaior)}
          </text>
        )}

        <text className="gr-texto" x={fatia / 2} y={ALTURA - 3} textAnchor="middle">
          1
        </text>
        <text
          className="gr-texto gr-forte"
          x={(diaDeHoje - 1) * fatia + fatia / 2}
          y={ALTURA - 3}
          textAnchor="middle"
        >
          hoje
        </text>
        <text className="gr-texto" x={LARGURA} y={ALTURA - 3} textAnchor="end">
          {total}
        </text>
      </svg>

      {ritmoPorDia !== null && (
        <p className="dica" style={{ marginTop: 6 }}>
          A linha tracejada é o normal: {formatarReais(ritmoPorDia)} por dia.
        </p>
      )}
    </figure>
  );
}
