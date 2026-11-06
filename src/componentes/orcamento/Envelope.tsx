/**
 * "Cabe na renda?": o envelope do orcamento.
 *
 * O numero vem de `folgaDoOrcamento`, e some sem entrada lancada (invariante 22).
 */

import { SeloDeEstado } from '../graficos/Estado';
import { folgaDoOrcamento } from '../../../compartilhado/orcamento';
import type { LinhaOrcamento } from '../../../compartilhado/tipos';
import { formatarReais } from '../../lib/dinheiro';

/** Cabe na renda? Some sem entrada lancada: o numero diria "nao cabe" por falta de dado. */
export function Envelope({
  dados,
  orc,
  agora,
  entradaManual,
}: {
  dados: Parameters<typeof folgaDoOrcamento>[0];
  orc: { ano: number; linhas: LinhaOrcamento[] };
  agora: number;
  entradaManual: number | null;
}) {
  const folga = folgaDoOrcamento(dados, orc, agora, entradaManual);
  if (folga === null) return null;

  return (
    <>
      <h2 className="secao-titulo">Cabe na renda?</h2>
      <section className="cartao">
        <div className="linha-entre">
          <span>Entradas estimadas</span>
          <strong>{formatarReais(folga.entradas)}</strong>
        </div>
        <div className="linha-entre">
          <span>− Tetos que ainda cabem</span>
          <strong>{formatarReais(folga.tetos)}</strong>
        </div>
        <div className="linha-entre">
          <span>− Parcelas de empréstimo</span>
          <strong>{formatarReais(folga.dividas)}</strong>
        </div>
        <div className="linha-entre">
          <span>− Reserva das metas</span>
          <strong>{formatarReais(folga.metas)}</strong>
        </div>
        <hr />
        <div className="linha-entre">
          <SeloDeEstado estado={folga.folga < 0 ? 'estoura' : 'cabe'} />
          <strong className={folga.folga < 0 ? 'valor-ruim' : 'valor-bom'}>
            {formatarReais(folga.folga)}
          </strong>
        </div>
        <p className="dica">
          {folga.folga < 0
            ? 'A soma dos tetos, das parcelas e das metas passa do que deve entrar.'
            : 'Sobra depois dos tetos, das parcelas e das metas.'}{' '}
          É estimativa: a entrada é a média dos últimos meses
          {folga.entradaFraca && ' (poucos meses, então é fraca)'}. Parcelas de cartão ficam de
          fora: a compra no crédito já pesa no teto, na data da compra.
        </p>
      </section>
    </>
  );
}
