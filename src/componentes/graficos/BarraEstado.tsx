/**
 * Uma barra do mes (Dia a dia, Contas fixas): o gasto contra o mes tipico, com o
 * estado em forma e nome e uma marca onde o ritmo normal estaria hoje.
 *
 * Substitui a `.barra` de uma cor so, que nao sabia dizer "aperta". O trilho e uma
 * regua tracejada, nao uma faixa: faixa clara sobre cartao branco some, e a regua
 * e a mesma linha que vem antes de todo total.
 *
 * A barra so desenha. O estado e a posicao da marca vem de `barrasDoMes`
 * (`lib/series.ts`), que usa a mesma estimativa da previsao — nenhuma conta aqui.
 */

import { formatarReais } from '../../lib/dinheiro';
import type { BarraDoMes } from '../../lib/series';
import { SeloDeEstado, NOME_DO_ESTADO } from './Estado';

const LARGURA = 300;

export function BarraEstado({
  nome,
  barra,
  descricao,
}: {
  nome: string;
  barra: BarraDoMes;
  /** A frase que diz o que o estado quer dizer, por extenso. */
  descricao: string;
}) {
  const escala = Math.max(barra.feito, barra.tipico, 1);
  const preenchido = Math.max(barra.feito > 0 ? 3 : 0, (barra.feito / escala) * LARGURA);

  const resumo =
    `${nome}: ${formatarReais(barra.feito)} de ${formatarReais(barra.tipico)} no mês típico. ` +
    `${NOME_DO_ESTADO[barra.estado]}. ${descricao}`;

  return (
    <div className="barra-estado">
      <div className="barra-estado-topo">
        <span>{nome}</span>
        <SeloDeEstado estado={barra.estado} />
      </div>

      <svg viewBox={`0 0 ${LARGURA} 18`} role="img" aria-label={resumo}>
        <line className="gr-regua" x1="0" y1="9" x2={LARGURA} y2="9" />
        <rect
          className={'gr-contorno gr-' + barra.estado}
          x="0.75"
          y="2.75"
          width={Math.max(0, preenchido - 1.5)}
          height="12.5"
        />
        {barra.hoje !== null && (
          <rect
            className="gr-serie-1"
            x={Math.min(LARGURA - 3, barra.hoje * LARGURA - 1.5)}
            y="0"
            width="3"
            height="18"
          />
        )}
      </svg>

      <div className="barra-estado-valores">
        <span>{formatarReais(barra.feito)}</span>
        <span>de {formatarReais(barra.tipico)}</span>
      </div>
      <p className="dica">{descricao}</p>
    </div>
  );
}
