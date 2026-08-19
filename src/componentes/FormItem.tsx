/**
 * O formulario de item, com os TRES campos digitaveis: quantidade, preco
 * unitario e valor total.
 *
 * O app antigo so deixava digitar quantidade e preco, calculando o total. Isso
 * quebra no mercado: 1,235 kg de alcatra a R$ 14,99/kg da R$ 18,5126, que
 * arredonda para R$ 18,51, mas a balança imprime R$ 18,52. Com cinco itens
 * pesados, a compra fecha diferente do cupom e nao ha como descobrir onde foi.
 *
 * A regra de preenchimento automatico e uma so, e ela e conservadora:
 *
 *   PREENCHE CAMPO VAZIO, NUNCA SOBRESCREVE O QUE VOCE DIGITOU.
 *
 * - digitou quantidade e preco  -> preenche o total
 * - digitou quantidade e total  -> preenche o preco unitario
 * - digitou so o total          -> preco unitario = total (quantidade 1)
 *
 * Nao sobrescrever e o ponto. Se o app recalculasse o preco ao voce corrigir o
 * total, o R$ 14,99 da prateleira viraria R$ 15,00 (1852 / 1,235 = 1499,6) e o
 * historico de precos — que alimenta a comparacao entre meses e as dicas —
 * ficaria contaminado por um numero que nunca existiu.
 */

import { useRef, useState, type FormEvent } from 'react';
import { CampoDinheiro } from './CampoDinheiro';
import { SugestoesItem } from './SugestoesItem';
import { UNIDADES, UNIDADE_PADRAO } from '../../compartilhado/constantes';
import {
  calcularPrecoUnitario,
  calcularTotalItem,
  divergenciaSuspeita,
} from '../../compartilhado/tipos';
import type { ItemLocal } from '../dados/banco';
import { formatarQuantidade, formatarReais, paraQuantidade } from '../lib/dinheiro';

export interface ValoresFormItem {
  nome: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  total: number;
}

interface Props {
  onSalvar: (valores: ValoresFormItem) => Promise<void>;
  /** Preenchido quando o formulario esta editando um item ja lançado. */
  itemInicial?: ItemLocal;
  onCancelar?: () => void;
}

export function FormItem({ onSalvar, itemInicial, onCancelar }: Props) {
  const editando = itemInicial !== undefined;

  const [nome, setNome] = useState(itemInicial?.nome ?? '');
  const [quantidadeTexto, setQuantidadeTexto] = useState(
    itemInicial ? formatarQuantidade(itemInicial.quantidade) : '1',
  );
  const [unidade, setUnidade] = useState(itemInicial?.unidade ?? UNIDADE_PADRAO);
  const [preco, setPreco] = useState(itemInicial?.precoUnitario ?? 0);
  const [total, setTotal] = useState(itemInicial?.total ?? 0);
  const [focoNoNome, setFocoNoNome] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Quais campos o usuario ja mexeu. Editar um item existente comeca com tudo
  // "tocado": os valores gravados sao dele, nao chute do app.
  const [tocado, setTocado] = useState({ preco: editando, total: editando });

  const campoNome = useRef<HTMLInputElement>(null);
  const quantidade = paraQuantidade(quantidadeTexto);

  function aoMudarQuantidade(texto: string) {
    setQuantidadeTexto(texto);
    const nova = paraQuantidade(texto);
    if (!tocado.total && nova > 0 && preco > 0) setTotal(calcularTotalItem(nova, preco));
    else if (!tocado.preco && nova > 0 && total > 0) setPreco(calcularPrecoUnitario(total, nova));
  }

  function aoMudarPreco(centavos: number) {
    setPreco(centavos);
    setTocado((t) => ({ ...t, preco: true }));
    if (!tocado.total && quantidade > 0 && centavos > 0) {
      setTotal(calcularTotalItem(quantidade, centavos));
    }
  }

  function aoMudarTotal(centavos: number) {
    setTotal(centavos);
    setTocado((t) => ({ ...t, total: true }));
    if (!tocado.preco && quantidade > 0 && centavos > 0) {
      setPreco(calcularPrecoUnitario(centavos, quantidade));
    }
  }

  function usarSugestao(nomeItem: string, unid: string, qtd: number, precoUnit: number) {
    setNome(nomeItem);
    setUnidade(unid);
    const quantidadeUsada = qtd || 1;
    setQuantidadeTexto(formatarQuantidade(quantidadeUsada));
    setPreco(precoUnit);
    setTotal(calcularTotalItem(quantidadeUsada, precoUnit));
    // Veio do catalogo, nao de voce: os campos seguem "nao tocados" para que
    // corrigir qualquer um deles ainda ajuste os outros sozinho.
    setTocado({ preco: false, total: false });
    setFocoNoNome(false);
  }

  const calculado = calcularTotalItem(quantidade, preco);
  const divergente = divergenciaSuspeita(quantidade, preco, total);
  const podeSalvar = nome.trim().length > 0 && quantidade > 0 && total > 0 && !salvando;

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (!podeSalvar) return;

    setSalvando(true);
    try {
      await onSalvar({ nome: nome.trim(), quantidade, unidade, precoUnitario: preco, total });
      if (!editando) {
        // Limpa para o proximo item mantendo a unidade e devolvendo o foco ao
        // nome: da para lançar o carrinho inteiro sem tirar a mao do teclado.
        setNome('');
        setQuantidadeTexto('1');
        setPreco(0);
        setTotal(0);
        setTocado({ preco: false, total: false });
        campoNome.current?.focus();
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="form-item" onSubmit={aoEnviar}>
      <input
        ref={campoNome}
        className="entrada"
        type="text"
        autoComplete="off"
        placeholder="Nome do item"
        aria-label="Nome do item"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onFocus={() => setFocoNoNome(true)}
        onBlur={() => setFocoNoNome(false)}
      />

      <SugestoesItem
        termo={nome}
        aberto={focoNoNome}
        onEscolher={(entrada) =>
          usarSugestao(entrada.nome, entrada.unidade, entrada.ultimaQuantidade, entrada.ultimoPreco)
        }
      />

      <div className="grade-item">
        <div>
          <label className="mini-rotulo" htmlFor="qtd">Quantidade</label>
          <input
            id="qtd"
            className="entrada"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={quantidadeTexto}
            onChange={(e) => aoMudarQuantidade(e.target.value)}
          />
        </div>
        <div>
          <label className="mini-rotulo" htmlFor="unid">Unidade</label>
          <select
            id="unid"
            className="entrada"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
          >
            {UNIDADES.map((opcao) => (
              <option key={opcao} value={opcao}>{opcao}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grade-item-4">
        <div>
          <label className="mini-rotulo" htmlFor="preco">Preço unitário</label>
          <CampoDinheiro id="preco" valor={preco} onChange={aoMudarPreco} />
        </div>
        <div>
          <label className="mini-rotulo" htmlFor="total">Valor total</label>
          <CampoDinheiro id="total" valor={total} onChange={aoMudarTotal} />
        </div>
      </div>

      <div className="form-item-rodape">
        <span className="conferencia">
          {divergente && (
            <>
              Confira: {formatarQuantidade(quantidade)} × {formatarReais(preco)} dá{' '}
              {formatarReais(calculado)}.{' '}
              <button
                type="button"
                onClick={() => {
                  setTotal(calculado);
                  setTocado((t) => ({ ...t, total: true }));
                }}
              >
                usar esse
              </button>
            </>
          )}
        </span>

        {onCancelar && (
          <button type="button" className="botao" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        <button type="submit" className="botao botao-primario" disabled={!podeSalvar}>
          {editando ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </form>
  );
}
