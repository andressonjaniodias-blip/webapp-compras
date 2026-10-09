/**
 * O que subiu (e o que caiu) no carrinho: cada item com a linha do preco dele.
 *
 * E o relatorio que so este app pode fazer. Um app de orcamento nao sabe o preco
 * do arroz; este guarda o preco de cada item de cada cupom. A ideia vem de
 * `catalogo.ts`, que ja mostra "▲ R$ 29,90 · era R$ 24,90" na hora de digitar —
 * aqui a mesma informacao, vista de uma vez e ao longo do tempo.
 *
 * Preco por UNIDADE, na unidade da compra mais recente: R$ 20 o kg e R$ 5 o pacote
 * de 250 g nao se comparam, e `historicoDePreco` ja descartou o que nao bate.
 */

import { formatarReais } from '../../lib/dinheiro';
import { formatarDataCurta } from '../../lib/datas';
import type { HistoricoDePreco } from '../../lib/series';
import { Sparkline } from './Sparkline';

/**
 * Quem escolhe QUAIS itens (os que mudaram, os maiores primeiro) e
 * `mudancasDePreco`; aqui so se desenha o que chega.
 */
export function PrecosQueSubiram({ historicos }: { historicos: readonly HistoricoDePreco[] }) {
  return (
    <div>
      {historicos.map((h) => {
        const subiu = h.variacao > 0;
        const primeiro = h.pontos[0]!;
        const ultimo = h.pontos[h.pontos.length - 1]!;
        const percentual = Math.round(Math.abs(h.variacao) * 100);

        return (
          <div className="preco-linha" key={h.chave}>
            <div className="preco-nome">
              {h.nome}
              <small>
                {formatarReais(primeiro.preco)} em {formatarDataCurta(primeiro.data)}, agora{' '}
                {formatarReais(ultimo.preco)}
              </small>
            </div>
            <Sparkline
              valores={h.pontos.map((p) => p.preco)}
              tom={subiu ? 'sobe' : 'cai'}
              rotulo={`${h.nome}: de ${formatarReais(primeiro.preco)} para ${formatarReais(ultimo.preco)}, ${subiu ? 'subiu' : 'caiu'} ${percentual}%.`}
            />
            <span className={'preco-variacao ' + (subiu ? 'subiu-preco' : 'caiu-preco')}>
              {subiu ? '▲' : '▼'} {percentual}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
