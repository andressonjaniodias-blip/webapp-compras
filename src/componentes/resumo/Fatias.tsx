/**
 * A fatia clicavel do Resumo ("Por conta", "Por forma de pagamento"): abre as compras
 * que formam o numero. Saiu de `paginas/Resumo.tsx`; so desenha.
 */

import { useState } from 'react';
import { type FatiaResumo } from '../../lib/resumo';
import { formatarReais } from '../../lib/dinheiro';
import { formatarData } from '../../lib/datas';
import { BarraDeProgresso } from '../graficos/BarraDeProgresso';

/** Quantas categorias aparecem antes do resto virar "outras". */
const CATEGORIAS_VISIVEIS = 6;

/**
 * Uma secao de fatias, com teto e com as compras por tras de cada numero.
 *
 * O teto existe porque sao 17 categorias possiveis: renderizar todas virava uma
 * parede de barras em que nao se achava nada. E a expansao existe porque resumo
 * em que nao se pode entrar e resumo que se para de conferir — o numero afirmava
 * "Mercado R$ 800" e nao havia caminho nenhum ate as compras que somavam isso.
 */
export function Fatias({
  titulo,
  legenda,
  fatias,
  abrir,
}: {
  titulo: string;
  legenda: string;
  fatias: readonly FatiaResumo[];
  abrir: (id: string) => void;
}) {
  const [tudo, setTudo] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const visiveis = tudo ? fatias : fatias.slice(0, CATEGORIAS_VISIVEIS);
  const restantes = fatias.length - visiveis.length;

  return (
    <>
      <h2 className="secao-titulo">{titulo}</h2>
      <div className="cartao">
        <p className="dica sem-topo">{legenda}</p>

        {visiveis.map((fatia) => (
          <div className="fatia" key={fatia.nome}>
            <button
              type="button"
              className="fatia-abrir"
              aria-expanded={aberta === fatia.nome}
              onClick={() => setAberta(aberta === fatia.nome ? null : fatia.nome)}
            >
              <div className="fatia-linha">
                <span>
                  {fatia.nome}
                  {fatia.delta !== null && fatia.delta !== 0 && (
                    <span className={'fatia-delta ' + (fatia.delta > 0 ? 'subiu' : 'caiu')}>
                      {fatia.delta > 0 ? '▲' : '▼'} {formatarReais(Math.abs(fatia.delta))}
                    </span>
                  )}
                </span>
                <span>
                  {formatarReais(fatia.total)} · {fatia.percentual.toFixed(0)}%
                </span>
              </div>
              <BarraDeProgresso
                progresso={fatia.percentual / 100}
                rotulo={`${fatia.nome}: ${Math.round(fatia.percentual)}% do total`}
              />
            </button>

            {aberta === fatia.nome && (
              <ul className="lista fatia-compras">
                {fatia.compras
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((compra) => (
                    <li key={compra.id}>
                      <button type="button" className="compra" onClick={() => abrir(compra.id)}>
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
            )}
          </div>
        ))}

        {restantes > 0 && (
          <button type="button" className="botao botao-largo" onClick={() => setTudo(true)}>
            Ver outras {restantes}
          </button>
        )}
      </div>
    </>
  );
}
