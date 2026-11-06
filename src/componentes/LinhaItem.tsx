/**
 * Um item ja lançado, na lista da compra.
 *
 * Mostra quantidade, unidade e preco unitario na linha de baixo, e o total do
 * item em destaque — que e o numero que precisa bater com o cupom.
 */

import type { ItemLocal } from '../dados/banco';
import { formatarReais, formatarQuantidade } from '../lib/dinheiro';

interface Props {
  item: ItemLocal;
  onEditar: () => void;
  onRemover: () => void;
}

export function LinhaItem({ item, onEditar, onRemover }: Props) {
  return (
    <li className="item-linha">
      {/* Um <button> de verdade, e nao uma div com role: ele ja traz o foco
          visivel, o Enter e o Espaco, e o leitor de tela o anuncia como botao. */}
      <button
        type="button"
        className="item-corpo"
        onClick={onEditar}
        aria-label={`Editar ${item.nome}`}
      >
        <span className="item-nome">{item.nome}</span>
        <span className="item-meta">
          {formatarQuantidade(item.quantidade)} {item.unidade}
          {item.precoUnitario > 0 && ' × ' + formatarReais(item.precoUnitario)}
        </span>
      </button>
      <span className="item-valor">{formatarReais(item.total)}</span>
      <button
        type="button"
        className="botao-icone"
        aria-label={'Remover ' + item.nome}
        onClick={onRemover}
      >
        ×
      </button>
    </li>
  );
}
