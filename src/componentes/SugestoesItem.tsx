/**
 * As sugestoes que aparecem enquanto voce digita o nome do item.
 *
 * Cada linha traz o ultimo preco e a data em que voce comprou aquilo. Isso e de
 * proposito e vale mais do que parece: e o jeito mais barato de perceber que
 * algo subiu — acontece na hora, olhando a prateleira, sem gastar chamada de
 * IA nem esperar o fim do mes.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import type { EntradaCatalogo } from '../dados/banco';
import { sugerir } from '../dados/catalogo';
import { formatarReais } from '../lib/dinheiro';
import { formatarDataCurta } from '../lib/datas';

interface Props {
  termo: string;
  aberto: boolean;
  onEscolher: (entrada: EntradaCatalogo) => void;
}

export function SugestoesItem({ termo, aberto, onEscolher }: Props) {
  const sugestoes = useLiveQuery(
    () => (aberto ? sugerir(termo) : Promise.resolve([])),
    [termo, aberto],
    [] as EntradaCatalogo[],
  );

  if (!aberto || sugestoes.length === 0) return null;

  return (
    <ul className="sugestoes">
      {sugestoes.map((entrada) => (
        <li key={entrada.chave}>
          <button
            type="button"
            className="sugestao"
            // onMouseDown em vez de onClick: o clique chega depois do blur do
            // campo, que ja teria fechado a lista antes de o toque valer.
            onMouseDown={(evento) => {
              evento.preventDefault();
              onEscolher(entrada);
            }}
          >
            <span>{entrada.nome}</span>
            <span className="sugestao-preco">
              {entrada.ultimoPreco > 0 && formatarReais(entrada.ultimoPreco) + ' · '}
              {formatarDataCurta(entrada.ultimaCompraEm)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
