/**
 * A tela inicial: todas as compras, da mais recente para a mais antiga, com o
 * botao de nova compra fixo no rodape, ao alcance do polegar.
 *
 * Criar uma compra leva direto para a tela de edicao. Nao ha etapa de
 * confirmacao nem status de "aberta": no mercado, o caminho entre pegar o
 * celular e digitar o primeiro item precisa ter o menor numero possivel de
 * toques.
 */

import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { criarCompra, listarCompras } from '../dados/compras';
import type { CompraLocal } from '../dados/banco';
import { formatarReais } from '../lib/dinheiro';
import { chaveMes, formatarData, nomeMes } from '../lib/datas';
import { useApp } from '../estado';
import { BarraSituacao } from '../componentes/BarraSituacao';

export function ListaCompras() {
  const navegar = useNavigate();
  const { atualizarPendentes } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);

  async function nova() {
    const id = await criarCompra();
    await atualizarPendentes();
    navegar('/compra/' + id);
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <h1>Compras</h1>
          <button
            type="button"
            className="botao-icone"
            aria-label="Resumo do mês"
            onClick={() => navegar('/resumo')}
          >
            ▦
          </button>
          <button
            type="button"
            className="botao-icone"
            aria-label="Ajustes"
            onClick={() => navegar('/ajustes')}
          >
            ⚙
          </button>
        </div>
        <BarraSituacao />
      </header>

      {compras === undefined && <p className="carregando">Carregando…</p>}

      {compras !== undefined && compras.length === 0 && (
        <p className="vazio">
          Nenhuma compra ainda.
          <br />
          Toque em <strong>Nova compra</strong> para registrar a primeira.
        </p>
      )}

      {compras !== undefined && compras.length > 0 && (
        <ul className="lista">{linhas(compras, (id) => navegar('/compra/' + id))}</ul>
      )}

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={nova}>
          Nova compra
        </button>
      </div>
    </div>
  );
}

/**
 * Insere um cabeçalho quando o mes muda. Sem isso, uma lista longa vira um
 * borrao de datas e nao da para achar "aquela compra de julho".
 */
function linhas(compras: readonly CompraLocal[], abrir: (id: string) => void) {
  const saida: React.ReactNode[] = [];
  let mesAnterior = '';

  for (const compra of compras) {
    const mes = chaveMes(compra.data);
    if (mes !== mesAnterior) {
      mesAnterior = mes;
      saida.push(
        <li key={'mes-' + mes}>
          <h2 className="secao-titulo">{nomeMes(mes)}</h2>
        </li>,
      );
    }

    saida.push(
      <li key={compra.id}>
        <button type="button" className="compra" onClick={() => abrir(compra.id)}>
          <div className="compra-corpo">
            <div className="compra-titulo">
              {compra.descricao || compra.categoria}
            </div>
            <div className="compra-meta">
              {formatarData(compra.data)} · {compra.formaPagamento}
              {compra.qtdItens > 0
                ? ` · ${compra.qtdItens} ${compra.qtdItens === 1 ? 'item' : 'itens'}`
                : ' · sem itens'}
              {compra.pendente === 1 && ' · não sincronizada'}
            </div>
          </div>
          <span className="compra-valor">{formatarReais(compra.total)}</span>
        </button>
      </li>,
    );
  }

  return saida;
}
