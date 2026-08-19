/**
 * A tela de uma compra: os dados dela em cima, os itens embaixo.
 *
 * A compra e sempre editavel — nao existe "encerrar" nem "reabrir". No mercado
 * voce cria, vai lançando e sai; em casa, se precisar corrigir, corrige. Um
 * estado a menos e uma trava a menos entre voce e o dado certo.
 *
 * O campo de valor total fica inerte quando ha itens, porque ai o total e a
 * soma deles. Essa e a regra que torna o detalhamento opcional: item a item no
 * supermercado, so o total no posto de gasolina.
 */

import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { FormItem, type ValoresFormItem } from '../componentes/FormItem';
import { LinhaItem } from '../componentes/LinhaItem';
import { SeletorChips } from '../componentes/SeletorChips';
import { CATEGORIAS, FORMAS_PAGAMENTO } from '../../compartilhado/constantes';
import {
  adicionarItem,
  atualizarCompra,
  atualizarItem,
  buscarCompra,
  excluirCompra,
  listarItens,
  removerItem,
} from '../dados/compras';
import type { ItemLocal } from '../dados/banco';
import { formatarReais } from '../lib/dinheiro';
import { deInputDataHora, paraInputDataHora } from '../lib/datas';
import { useApp } from '../estado';

export function EditarCompra() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { atualizarPendentes } = useApp();

  // `undefined` = carregando; `null` = nao existe (foi excluida).
  const compra = useLiveQuery(async () => (await buscarCompra(id)) ?? null, [id]);
  const itens = useLiveQuery(() => listarItens(id), [id], [] as ItemLocal[]);

  const [emEdicao, setEmEdicao] = useState<string | null>(null);

  if (compra === undefined) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  if (compra === null) return <Navigate to="/" replace />;

  const temItens = itens.length > 0;

  async function mudar(mudancas: Parameters<typeof atualizarCompra>[1]) {
    await atualizarCompra(id, mudancas);
    await atualizarPendentes();
  }

  async function salvarNovoItem(valores: ValoresFormItem) {
    await adicionarItem(id, valores);
    await atualizarPendentes();
  }

  async function apagarCompra() {
    const certeza = window.confirm(
      'Excluir esta compra e todos os itens dela? Isso some também dos outros aparelhos.',
    );
    if (!certeza) return;
    await excluirCompra(id);
    await atualizarPendentes();
    navegar('/', { replace: true });
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/')}>
            ‹
          </button>
          <h1>Compra</h1>
          <button type="button" className="botao-icone" aria-label="Excluir compra" onClick={apagarCompra}>
            🗑
          </button>
        </div>
      </header>

      <section className="cartao">
        <span className="campo-rotulo">Total</span>
        <div className="total-grande">{formatarReais(compra.total)}</div>
        <p className="dica">
          {temItens
            ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} · somados`
            : 'lançada só com o total, sem itens'}
          {compra.pendente === 1 && ' · ainda não sincronizada'}
        </p>
      </section>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="descricao">Onde foi</label>
        <input
          id="descricao"
          className="entrada"
          type="text"
          autoComplete="off"
          placeholder="Supermercado, posto, farmácia…"
          value={compra.descricao}
          onChange={(e) => void mudar({ descricao: e.target.value })}
        />
      </div>

      <div className="campo">
        <span className="campo-rotulo">Categoria</span>
        <SeletorChips
          opcoes={CATEGORIAS}
          valor={compra.categoria}
          rotulo="Categoria"
          onChange={(categoria) => void mudar({ categoria })}
        />
      </div>

      <div className="campo">
        <span className="campo-rotulo">Forma de pagamento</span>
        <SeletorChips
          opcoes={FORMAS_PAGAMENTO}
          valor={compra.formaPagamento}
          rotulo="Forma de pagamento"
          onChange={(formaPagamento) => void mudar({ formaPagamento })}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="quando">Data e hora</label>
        <input
          id="quando"
          className="entrada"
          type="datetime-local"
          value={paraInputDataHora(compra.data)}
          onChange={(e) => {
            const data = deInputDataHora(e.target.value);
            if (data !== null) void mudar({ data });
          }}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="valor">
          Valor total {temItens && '(vem da soma dos itens)'}
        </label>
        <CampoDinheiro
          id="valor"
          valor={temItens ? compra.total : compra.totalManual}
          disabled={temItens}
          onChange={(totalManual) => void mudar({ totalManual })}
        />
        {temItens && (
          <p className="dica">Remova todos os itens para voltar a digitar o valor à mão.</p>
        )}
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="obs">Observação</label>
        <textarea
          id="obs"
          className="entrada"
          placeholder="Qualquer coisa que não cabe nos outros campos"
          value={compra.observacao}
          onChange={(e) => void mudar({ observacao: e.target.value })}
        />
      </div>

      <h2 className="secao-titulo">Itens ({itens.length})</h2>

      {itens.length === 0 && (
        <p className="dica">
          Itens são opcionais. Lance um a um quando quiser acompanhar preço; deixe vazio
          quando só o total interessar.
        </p>
      )}

      <ul className="lista">
        {itens.map((item) =>
          emEdicao === item.id ? (
            <li key={item.id}>
              <FormItem
                itemInicial={item}
                onCancelar={() => setEmEdicao(null)}
                onSalvar={async (valores) => {
                  await atualizarItem(item.id, valores);
                  await atualizarPendentes();
                  setEmEdicao(null);
                }}
              />
            </li>
          ) : (
            <LinhaItem
              key={item.id}
              item={item}
              onEditar={() => setEmEdicao(item.id)}
              onRemover={async () => {
                await removerItem(item.id);
                await atualizarPendentes();
              }}
            />
          ),
        )}
      </ul>

      {emEdicao === null && <FormItem onSalvar={salvarNovoItem} />}

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={() => navegar('/')}>
          Concluir
        </button>
      </div>
    </div>
  );
}
