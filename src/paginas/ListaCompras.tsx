/**
 * As compras, um mes por vez, com o botao de nova compra fixo no rodape, ao
 * alcance do polegar.
 *
 * UM MES POR VEZ porque a lista inteira, com todos os meses um depois do outro,
 * vira em um ano uma rolagem sem fim. O navegador e o mesmo do Resumo, e o mes
 * escolhido vive na URL: abrir uma compra e voltar devolve a pessoa ao mesmo mes.
 *
 * Esta tela tem dois papeis. Quem nao tem lado financeiro (modo simples, ou
 * ninguem cadastrou conta nem entrada) a ve como TELA INICIAL, exatamente como
 * sempre foi — e o que o Principio 0 pede. Quem tem, ve o painel na tela
 * inicial (`Painel.tsx`) e chega aqui pelo cartao "Compras", em `/compras`,
 * onde ela ganha o "‹" de voltar. O que decide e a prop `inicio`.
 *
 * AS PARCELAS DE EMPRESTIMO APARECEM NA LISTA, entre as compras, na data em que
 * saem da conta, com a situacao por extenso ("descontada em 05/10"). Sem isso nao
 * havia lugar onde se visse, parcela a parcela, se o emprestimo ja foi
 * descontado. Sao linhas INFORMATIVAS: nao sao compra e nao somam em total
 * nenhum — a parcela ja e contada como pagamento e como desconto em folha
 * (invariantes 10, 17 e 19). So aparecem fora do modo simples e havendo
 * emprestimo cadastrado.
 *
 * Criar uma compra leva direto para a tela de edicao. Nao ha etapa de
 * confirmacao nem status de "aberta": no mercado, o caminho entre pegar o
 * celular e digitar o primeiro item precisa ter o menor numero possivel de
 * toques.
 *
 * PRINCÍPIO 0, na redacao corrigida: para quem nunca cadastrou conta nem
 * entrada, esta tela nao ganha NUMERO nenhum, nem aviso, nem "configure alguma
 * coisa".
 *
 * A PORTA nao e escondida. Antes o 💳 dependia de ja existir conta ou renda —
 * ou seja, o botao que leva a cadastrar a primeira conta so aparecia depois da
 * primeira conta existir. Num aparelho novo o efeito era pior: enquanto a
 * primeira sincronizacao nao terminava (e o Render hiberna, entao ela demora),
 * nao havia NENHUM caminho ate contas e cartoes, e se ela falhasse nao havia
 * caminho nunca. Hoje a porta so some por escolha explicita — o modo simples —,
 * jamais por falta de dado ou de rede.
 */

import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { criarCompra, listarCompras } from '../dados/compras';
import type { CompraLocal } from '../dados/banco';
import { useFinanceiro } from '../dados/financeiro';
import {
  extratoDeDividas,
  gastoComDividasNoMes,
  type ParcelaDeDivida,
} from '../../compartilhado/carteira';
import { formatarReais } from '../lib/dinheiro';
import { chaveMes, formatarData, mesesDaLista, nomeMes } from '../lib/datas';
import { resumirMes } from '../lib/resumo';
import { textoDaParcela } from '../lib/situacaoParcela';
import { useMesDaUrl } from '../lib/useMesDaUrl';
import { useVoltar } from '../lib/useVoltar';
import { useApp } from '../estado';
import { BarraSituacao } from '../componentes/BarraSituacao';
import { NavegadorDeMes } from '../componentes/NavegadorDeMes';

export function ListaCompras({ inicio = false }: { inicio?: boolean }) {
  const navegar = useNavigate();
  const voltar = useVoltar('/');
  const { atualizarPendentes } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);
  const financeiro = useFinanceiro();

  const agora = Date.now();
  const extrato: ParcelaDeDivida[] =
    !financeiro.modoSimples && financeiro.temDividas
      ? extratoDeDividas(financeiro.dados, agora)
      : [];

  const meses = mesesDaLista(
    [
      ...(compras ?? []).map((c) => chaveMes(c.data)),
      ...extrato.map((p) => chaveMes(p.quando)),
    ],
    agora,
  );
  const [mes, escolherMes] = useMesDaUrl(meses);

  const apelidos = new Map(financeiro.dados.contas.map((c) => [c.id, c.apelido]));

  async function nova() {
    const id = await criarCompra();
    await atualizarPendentes();
    navegar('/compra/' + id);
  }

  const comprasDoMes = (compras ?? []).filter((c) => chaveMes(c.data) === mes);
  const parcelasDoMes = extrato.filter((p) => chaveMes(p.quando) === mes);

  // Com emprestimo na lista, ela deixa de ser so de COMPRAS: e de gastos. Vale o
  // mesmo na tela aberta pelo painel, que ja se chama Gastos.
  const gastos = !inicio || extrato.length > 0;
  const mesPorExtenso = nomeMes(mes).split(' ')[0];
  const compradoNoMes = compras ? resumirMes(compras, mes).total : 0;
  const comDividas = gastoComDividasNoMes(extrato, mes);

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          {!inicio && (
            <button type="button" className="botao-icone" aria-label="Voltar" onClick={voltar}>
              ‹
            </button>
          )}
          <h1>{gastos ? 'Gastos' : 'Compras'}</h1>
          {inicio && !financeiro.modoSimples && (
            <button
              type="button"
              className="botao-icone"
              aria-label="Controle financeiro"
              onClick={() => navegar('/carteira')}
            >
              💳
              <span className="rotulo-largo">Controle financeiro</span>
            </button>
          )}
          {inicio && (
            <>
              <button
                type="button"
                className="botao-icone"
                aria-label="Resumo do mês"
                onClick={() => navegar('/resumo')}
              >
                ▦
                <span className="rotulo-largo">Resumo</span>
              </button>
              <button
                type="button"
                className="botao-icone"
                aria-label="Ajustes"
                onClick={() => navegar('/ajustes')}
              >
                ⚙
                <span className="rotulo-largo">Ajustes</span>
              </button>
            </>
          )}
        </div>
        {inicio && <BarraSituacao />}
      </header>

      {compras === undefined && <p className="carregando">Carregando…</p>}

      {compras !== undefined && (
        <>
          <NavegadorDeMes meses={meses} mes={mes} onChange={escolherMes} />

          {/*
            O total do mes. As compras sao o "Comprei" do Resumo, a mesma conta; os
            emprestimos somam so o que JA saiu da conta (descontado ou pago), e
            aparecem separados para o total se poder conferir. Isto e apresentacao:
            "Comprei" e a sobra nao mudam.
          */}
          <div className="mes-total">
            <span>{gastos ? 'Gastei' : 'Comprei'} em {mesPorExtenso}</span>
            <span>{formatarReais(compradoNoMes + comDividas.total)}</span>
          </div>
          {comDividas.parcelas > 0 && (
            <p className="dica mes-total-detalhe">
              compras {formatarReais(compradoNoMes)} · empréstimos e financiamentos{' '}
              {formatarReais(comDividas.total)}
            </p>
          )}

          {comprasDoMes.length === 0 && parcelasDoMes.length === 0 && (
            <p className="vazio">
              Nenhum gasto em {mesPorExtenso}.
              <br />
              Toque em <strong>Nova compra</strong> para registrar.
            </p>
          )}

          <ul className="lista">
            {linhas(comprasDoMes, parcelasDoMes, apelidos, navegar)}
          </ul>
        </>
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
 * As compras e as parcelas de emprestimo do mes, juntas, da mais recente para a
 * mais antiga.
 */
function linhas(
  compras: readonly CompraLocal[],
  parcelas: readonly ParcelaDeDivida[],
  apelidos: ReadonlyMap<string, string>,
  navegar: (destino: string) => void,
) {
  const itens: { quando: number; no: React.ReactNode }[] = [];

  for (const compra of compras) {
    const conta = compra.contaId ? apelidos.get(compra.contaId) : undefined;
    const vezes = compra.parcelas ?? 1;

    itens.push({
      quando: compra.data,
      no: (
        <li key={compra.id}>
          <button type="button" className="compra" onClick={() => navegar('/compra/' + compra.id)}>
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
        </li>
      ),
    });
  }

  for (const parcela of parcelas) {
    itens.push({
      quando: parcela.quando,
      no: (
        <li key={'divida-' + parcela.dividaId + parcela.competencia}>
          <button
            type="button"
            className="compra"
            onClick={() => navegar(`/parcela/${parcela.dividaId}/${parcela.competencia}`)}
          >
            <div className="compra-corpo">
              <div className="compra-titulo">
                {parcela.descricao || 'Empréstimo'}
                <span className="selo selo-emprestimo">empréstimo</span>
              </div>
              <div className={'compra-meta' + (parcela.situacao === 'em_aberto' ? ' valor-ruim' : '')}>
                parcela {parcela.indice} de {parcela.de} · {textoDaParcela(parcela)}
              </div>
            </div>
            <span className="compra-valor">{formatarReais(parcela.valor)}</span>
          </button>
        </li>
      ),
    });
  }

  return itens.sort((a, b) => b.quando - a.quando).map((item) => item.no);
}
