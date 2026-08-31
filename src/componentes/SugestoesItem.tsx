/**
 * As sugestoes que aparecem enquanto voce digita o nome do item.
 *
 * Cada linha traz o preco e a data em que voce comprou aquilo. Isso e de
 * proposito e vale mais do que parece: e o jeito mais barato de perceber que
 * algo subiu — acontece na hora, olhando a prateleira, sem gastar chamada de IA
 * nem esperar o fim do mes. Por isso a linha mostra tambem o preco ANTERIOR: sem
 * ele, "R$ 24,90" nao diz se esta caro, e o proposito do campo nao se cumpre.
 *
 * Duas decisoes de comportamento:
 *
 * 1. A lista e SOBREPOSTA, nao empurrada (ver `.sugestoes` no CSS). No fluxo
 *    normal, seis sugestoes jogavam quantidade, preco e total ~300px para baixo
 *    enquanto voce digitava, e eles pulavam de volta quando a lista fechava.
 *    Campo que se mexe embaixo do dedo faz errar o toque.
 * 2. `onPointerDown`, e nao `onClick` nem `onMouseDown`: o clique chega depois
 *    do blur do campo, que ja teria fechado a lista. `pointerdown` cobre toque e
 *    mouse no mesmo evento.
 *
 * Quem busca a lista e o `FormItem`, nao este componente: e ele que precisa
 * saber quantas sugestoes existem para as setas do teclado pararem no fim.
 */

import type { EntradaCatalogo } from '../dados/banco';
import { formatarReais } from '../lib/dinheiro';
import { formatarDataCurta } from '../lib/datas';

interface Props {
  sugestoes: readonly EntradaCatalogo[];
  /** Indice destacado pelas setas. -1 = nenhum. */
  destacado: number;
  onEscolher: (entrada: EntradaCatalogo) => void;
}

export function SugestoesItem({ sugestoes, destacado, onEscolher }: Props) {
  if (sugestoes.length === 0) return null;

  return (
    <ul className="sugestoes" role="listbox" aria-label="Itens já comprados">
      {sugestoes.map((entrada, indice) => (
        <li key={entrada.chave}>
          <button
            type="button"
            className={'sugestao' + (indice === destacado ? ' sugestao-destacada' : '')}
            role="option"
            aria-selected={indice === destacado}
            onPointerDown={(evento) => {
              evento.preventDefault();
              onEscolher(entrada);
            }}
          >
            <span>{entrada.nome}</span>
            <span className="sugestao-preco">
              <Preco entrada={entrada} />
              {formatarDataCurta(entrada.ultimaCompraEm)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * O preco, com a seta de variacao quando ha com o que comparar.
 *
 * Sem o preco anterior nao ha variacao para mostrar — e o caso de quem comprou o
 * item uma vez so. Ai fica so o valor, como era antes.
 */
function Preco({ entrada }: { entrada: EntradaCatalogo }) {
  if (entrada.ultimoPreco <= 0) return null;

  const anterior = entrada.precoAnterior ?? 0;
  const subiu = anterior > 0 && entrada.ultimoPreco > anterior;
  const caiu = anterior > 0 && entrada.ultimoPreco < anterior;

  return (
    <>
      {subiu && <span className="subiu">▲ </span>}
      {caiu && <span className="caiu">▼ </span>}
      {formatarReais(entrada.ultimoPreco)}
      {(subiu || caiu) && <span className="sugestao-antes"> · era {formatarReais(anterior)}</span>}
      {' · '}
    </>
  );
}
