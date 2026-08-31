/**
 * A tela inicial: todas as compras, da mais recente para a mais antiga, com o
 * botao de nova compra fixo no rodape, ao alcance do polegar.
 *
 * Criar uma compra leva direto para a tela de edicao. Nao ha etapa de
 * confirmacao nem status de "aberta": no mercado, o caminho entre pegar o
 * celular e digitar o primeiro item precisa ter o menor numero possivel de
 * toques.
 *
 * PRINCÍPIO 0: para quem nunca cadastrou conta nem entrada, esta tela e
 * exatamente a de antes da v2 — sem linha de previsao, sem icone a mais, sem
 * aviso de "configure alguma coisa". A linha de previsao so nasce quando ha
 * renda cadastrada, e ela existe porque informacao que so aparece quando a
 * pessoa vai procurar nao muda decisao nenhuma.
 */

import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { criarCompra, listarCompras } from '../dados/compras';
import type { CompraLocal } from '../dados/banco';
import { useFinanceiro } from '../dados/financeiro';
import { limitesDo } from '../../compartilhado/planos';
import { panorama } from '../../compartilhado/previsao';
import { formatarReais } from '../lib/dinheiro';
import { chaveMes, formatarData, nomeMes } from '../lib/datas';
import { useApp } from '../estado';
import { BarraSituacao } from '../componentes/BarraSituacao';

export function ListaCompras() {
  const navegar = useNavigate();
  const { atualizarPendentes, plano } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);
  const financeiro = useFinanceiro();

  const apelidos = new Map(financeiro.dados.contas.map((c) => [c.id, c.apelido]));

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
          {financeiro.mostrar && (
            <button
              type="button"
              className="botao-icone"
              aria-label="Carteira"
              onClick={() => navegar('/carteira')}
            >
              💳
            </button>
          )}
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
        {financeiro.mostrar && financeiro.temRenda && (
          <LinhaDePrevisao
            financeiro={financeiro}
            plano={plano}
            onTocar={() => navegar('/simular')}
          />
        )}
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
        <ul className="lista">
          {linhas(compras, apelidos, (id) => navegar('/compra/' + id))}
        </ul>
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
 * A previsao onde ela muda decisao: na tela que voce ja abre.
 *
 * Uma linha so, tocavel, levando ao simulador. E o caminho mais curto entre
 * pegar o celular na frente da prateleira e saber se da.
 */
function LinhaDePrevisao({
  financeiro,
  plano,
  onTocar,
}: {
  financeiro: ReturnType<typeof useFinanceiro>;
  plano: ReturnType<typeof useApp>['plano'];
  onTocar: () => void;
}) {
  const limites = limitesDo(plano);
  const visao = panorama(financeiro.dados, {
    meses: Math.max(12, limites.mesesDePrevisao),
    agora: Date.now(),
    gastoManual: financeiro.gastoManual,
  });

  const apertado = visao.mesMaisApertado;
  const mostraAperto = apertado !== null && apertado.saldoAcumulado < visao.carteira.saldoEmConta;

  return (
    <button type="button" className="previsao-linha" onClick={onTocar}>
      <span>
        sobra prevista deste mês{' '}
        <strong className={visao.sobraDoMes < 0 ? 'subiu' : ''}>
          {formatarReais(visao.sobraDoMes)}
        </strong>
      </span>
      {mostraAperto && (
        <span className="previsao-aperto">
          aperto em {nomeMes(apertado.mes).slice(0, 3)}{' '}
          {limites.simuladorCompleto ? formatarReais(apertado.saldoAcumulado) : ''}
        </span>
      )}
    </button>
  );
}

/**
 * Insere um cabeçalho quando o mes muda. Sem isso, uma lista longa vira um
 * borrao de datas e nao da para achar "aquela compra de julho".
 */
function linhas(
  compras: readonly CompraLocal[],
  apelidos: ReadonlyMap<string, string>,
  abrir: (id: string) => void,
) {
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

    const conta = compra.contaId ? apelidos.get(compra.contaId) : undefined;
    const vezes = compra.parcelas ?? 1;

    saida.push(
      <li key={compra.id}>
        <button type="button" className="compra" onClick={() => abrir(compra.id)}>
          <div className="compra-corpo">
            <div className="compra-titulo">
              {compra.descricao || compra.categoria}
            </div>
            <div className="compra-meta">
              {formatarData(compra.data)} · {conta ?? compra.formaPagamento}
              {vezes > 1 && ` · ${vezes}x`}
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
