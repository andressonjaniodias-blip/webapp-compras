/**
 * Os ultimos meses de gasto, uma coluna por mes, empilhada em fixo, variavel e
 * eventual, contra o mes tipico.
 *
 * O mes TIPICO e a media dos meses completos (`estimarGastoCorrente`) e conta so
 * o fixo e o variavel: o eventual (uma geladeira) nao se repete, e comparar o
 * total contra a media acusaria "acima do normal" todo mes com uma compra unica.
 * Por isso a linha tracejada deve ser lida contra a parte de baixo da coluna
 * (fixo e variavel); o eventual aparece em cima, a parte.
 *
 * O mes em curso ainda nao fechou e e desenhado tracejado e mais claro, com o
 * "ate agora" na leitura. Tocar numa coluna escolhe aquele mes na tela inteira
 * (`aoEscolher`): o grafico e tambem o seletor de mes mais rapido que o app tem.
 */

import { formatarMilReais, formatarReais, formatarReaisCurto } from '../../lib/dinheiro';
import { nomeMes } from '../../lib/datas';
import type { MesDaSerie } from '../../lib/series';
import { escalaLinear, tetoRedondo } from './escala';

const LARGURA = 300;
const ALTURA = 190;
const TOPO = 20;
const RODAPE = 26;

const curto = (mes: string) => nomeMes(mes).split(' ')[0]!.slice(0, 3);
const inteiro = (mes: string) => nomeMes(mes).split(' ')[0]!;

export function ColunasMensais({
  serie,
  tipico,
  selecionado,
  aoEscolher,
}: {
  serie: readonly MesDaSerie[];
  /** Fixo mais variavel, em media. `null` sem base. */
  tipico: number | null;
  selecionado: string;
  aoEscolher: (mes: string) => void;
}) {
  const maiorTotal = Math.max(...serie.map((m) => m.total), tipico ?? 0, 1);
  const teto = tetoRedondo(maiorTotal * 1.08);
  const y = escalaLinear(0, teto, ALTURA - RODAPE, TOPO);

  const faixa = LARGURA / serie.length;
  const largura = Math.min(40, faixa - 10);

  const escolhido = serie.find((m) => m.mes === selecionado) ?? serie[serie.length - 1]!;
  const desvio = tipico !== null && !escolhido.parcial ? escolhido.fixo + escolhido.variavel - tipico : null;

  return (
    <figure className="grafico">
      <figcaption className="grafico-leitura" aria-live="polite">
        <strong>
          {inteiro(escolhido.mes)}
          {escolhido.parcial ? ', até agora' : ''}
        </strong>
        : <span className="valor">{formatarReais(escolhido.total)}</span>
        <br />
        Fixo {formatarReais(escolhido.fixo)}, variável {formatarReais(escolhido.variavel)}
        {escolhido.eventual > 0 ? `, eventual ${formatarReais(escolhido.eventual)}` : ''}
        {desvio !== null && desvio !== 0
          ? `. ${desvio > 0 ? '▲' : '▼'} ${formatarReais(Math.abs(desvio))} ${desvio > 0 ? 'acima' : 'abaixo'} do típico.`
          : '.'}
      </figcaption>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label={
          `Gasto dos últimos ${serie.length} meses, em fixo, variável e eventual.` +
          (tipico !== null ? ` O mês típico é ${formatarReais(tipico)}.` : '')
        }
      >
        <line className="gr-eixo" x1="0" y1={y(0)} x2={LARGURA} y2={y(0)} />

        {serie.map((mes, i) => {
          const centro = faixa * i + faixa / 2;
          const x = centro - largura / 2;
          const ativo = mes.mes === escolhido.mes;
          const camadas = [
            { valor: mes.fixo, classe: 'gr-serie-1' },
            { valor: mes.variavel, classe: 'gr-serie-2' },
            { valor: mes.eventual, classe: 'gr-serie-3' },
          ];
          let base = 0;

          return (
            <g
              key={mes.mes}
              className="gr-toque"
              tabIndex={0}
              role="button"
              aria-label={`${inteiro(mes.mes)}: ${formatarReais(mes.total)}`}
              aria-pressed={ativo}
              onClick={() => aoEscolher(mes.mes)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  aoEscolher(mes.mes);
                }
              }}
            >
              {camadas.map((camada) => {
                if (camada.valor <= 0) return null;
                const topo = y(base + camada.valor);
                const fundo = y(base);
                base += camada.valor;
                return (
                  <rect
                    key={camada.classe}
                    className={'gr-foco gr-contorno ' + camada.classe}
                    x={x}
                    y={topo}
                    width={largura}
                    height={Math.max(1, fundo - topo)}
                    fillOpacity={mes.parcial ? 0.5 : 1}
                    strokeDasharray={mes.parcial ? '3 3' : undefined}
                  />
                );
              })}
              <rect x={centro - faixa / 2} y="0" width={faixa} height={ALTURA} fill="transparent" />
              <text
                className={'gr-texto' + (ativo ? ' gr-forte' : '')}
                x={centro}
                y={y(mes.total) - 5}
                textAnchor="middle"
              >
                {formatarMilReais(mes.total)}
              </text>
              <text
                className={'gr-texto' + (ativo ? ' gr-forte' : '')}
                x={centro}
                y={ALTURA - 9}
                textAnchor="middle"
              >
                {curto(mes.mes)}
              </text>
              {ativo && <rect className="gr-serie-1" x={centro - 8} y={ALTURA - 5} width="16" height="3" />}
            </g>
          );
        })}

        {tipico !== null && (
          <line className="gr-regua" x1="0" y1={y(tipico)} x2={LARGURA} y2={y(tipico)} />
        )}
      </svg>

      <ul className="grafico-legenda">
        <li><i style={{ background: 'var(--serie-1)' }} />Fixo</li>
        <li><i style={{ background: 'var(--serie-2)' }} />Variável</li>
        <li><i style={{ background: 'var(--serie-3)' }} />Eventual</li>
      </ul>
      <p className="dica" style={{ marginTop: 6 }}>
        Topo da coluna em R$ mil.
        {tipico !== null &&
          ` A linha tracejada é o seu mês típico: ${formatarReaisCurto(tipico)}, só fixo e variável.`}
      </p>
    </figure>
  );
}
