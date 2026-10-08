/**
 * A tela inicial: as compras, da mais recente para a mais antiga, e o dinheiro
 * que entra, em duas abas (Despesas e Receitas), com o botao de novo
 * lancamento fixo no rodape, ao alcance do polegar.
 *
 * AS ABAS EXISTEM PORQUE O DINHEIRO QUE ENTRA ESTAVA ESCONDIDO. Para achar uma
 * entrada era preciso ir a Carteira, rolar ate "Cadastros" e abrir Entradas — e
 * la o que aparece e a REGRA ("salario, todo dia 5"), nao as datas em que o
 * dinheiro caiu. A aba Receitas lista os lancamentos, mes a mes, no mesmo
 * formato das compras. As abas seguem a regra da porta 💳: somem so no modo
 * simples, nunca por falta de dado — a aba Receitas vazia e o caminho para
 * cadastrar a primeira entrada. A aba escolhida vive na URL (`?aba=receitas`)
 * para que abrir um lancamento e voltar devolva a mesma aba.
 *
 * Criar uma compra leva direto para a tela de edicao. Nao ha etapa de
 * confirmacao nem status de "aberta": no mercado, o caminho entre pegar o
 * celular e digitar o primeiro item precisa ter o menor numero possivel de
 * toques.
 *
 * PRINCÍPIO 0, na redacao corrigida: para quem nunca cadastrou conta nem
 * entrada, esta tela nao ganha NUMERO nenhum, nem aviso, nem "configure alguma
 * coisa". A linha de previsao so nasce quando ha renda cadastrada, porque
 * informacao que so aparece quando a pessoa vai procurar nao muda decisao
 * nenhuma.
 *
 * O que mudou: a PORTA nao e mais escondida. Antes o 💳 dependia de ja existir
 * conta ou renda — ou seja, o botao que leva a cadastrar a primeira conta so
 * aparecia depois da primeira conta existir. Num aparelho novo o efeito era
 * pior: enquanto a primeira sincronizacao nao terminava (e o Render hiberna,
 * entao ela demora), nao havia NENHUM caminho ate contas e cartoes, e se ela
 * falhasse nao havia caminho nunca. Hoje a porta so some por escolha explicita
 * — o modo simples —, jamais por falta de dado ou de rede.
 */

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { criarCompra, listarCompras } from '../dados/compras';
import type { CompraLocal } from '../dados/banco';
import { criarRenda } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { ORIGENS_RENDA } from '../../compartilhado/constantes';
import { lancamentosDeRenda } from '../../compartilhado/carteira';
import { limitesDo } from '../../compartilhado/planos';
import { panorama } from '../../compartilhado/previsao';
import { formatarReais } from '../lib/dinheiro';
import { chaveMes, formatarData, intervaloDoMes, nomeMes } from '../lib/datas';
import { useApp } from '../estado';
import { Abas } from '../componentes/Abas';
import { BarraSituacao } from '../componentes/BarraSituacao';

type Aba = 'despesas' | 'receitas';

const ABAS: readonly { valor: Aba; rotulo: string }[] = [
  { valor: 'despesas', rotulo: 'Despesas' },
  { valor: 'receitas', rotulo: 'Receitas' },
];

export function ListaCompras() {
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const { atualizarPendentes, plano } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);
  const financeiro = useFinanceiro();

  const apelidos = new Map(financeiro.dados.contas.map((c) => [c.id, c.apelido]));

  // No modo simples nao ha aba: a tela e so de compras, como sempre foi. Um
  // `?aba=receitas` esquecido num atalho nao pode prender a pessoa numa lista
  // que ela escolheu nao ter.
  const comAbas = !financeiro.modoSimples;
  const aba: Aba = comAbas && params.get('aba') === 'receitas' ? 'receitas' : 'despesas';

  function trocarAba(nova: Aba) {
    setParams(nova === 'receitas' ? { aba: 'receitas' } : {}, { replace: true });
  }

  async function nova() {
    const id = await criarCompra();
    await atualizarPendentes();
    navegar('/compra/' + id);
  }

  async function novaEntrada() {
    const id = await criarRenda({ origem: ORIGENS_RENDA[0], periodicidade: 'mensal' });
    await atualizarPendentes();
    navegar('/rendas?editar=' + id);
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <h1>Compras</h1>
          {!financeiro.modoSimples && (
            <button
              type="button"
              className="botao-icone"
              aria-label={financeiro.mostrar ? 'Carteira' : 'Controle financeiro'}
              onClick={() => navegar('/carteira')}
            >
              💳
              <span className="rotulo-largo">
                {financeiro.mostrar ? 'Carteira' : 'Controle financeiro'}
              </span>
            </button>
          )}
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
        </div>
        <BarraSituacao />
        {financeiro.mostrar && financeiro.temRenda && (
          <LinhaDePrevisao
            financeiro={financeiro}
            plano={plano}
            onTocar={() => navegar('/simular')}
          />
        )}
        {comAbas && (
          <Abas abas={ABAS} ativa={aba} onChange={trocarAba} rotulo="Tipo de lançamento" />
        )}
      </header>

      {aba === 'despesas' && (
        <>
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
        </>
      )}

      {aba === 'receitas' && (
        <ListaReceitas
          carregando={financeiro.carregando}
          rendas={financeiro.dados.rendas}
          apelidos={apelidos}
          abrir={(id) => navegar('/rendas?editar=' + id)}
        />
      )}

      <div className="rodape">
        {aba === 'despesas' ? (
          <button type="button" className="botao botao-primario" onClick={nova}>
            Nova compra
          </button>
        ) : (
          <button type="button" className="botao botao-primario" onClick={novaEntrada}>
            Nova entrada
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Os lancamentos de entrada, mes a mes. Cada linha e uma DATA em que o dinheiro
 * caiu — um salario mensal vira uma linha por mes —, e tocar nela abre o
 * cadastro da regra, porque o app guarda a regra e nao o mes isolado. Por isso
 * a linha de uma entrada recorrente diz "todo dia N": mexer ali muda todos os
 * meses, e quem toca precisa saber antes.
 *
 * O teto e o fim do mes corrente: o que ainda vai cair neste mes aparece,
 * marcado, porque "o salario ja caiu?" e a pergunta que mais se faz aqui.
 *
 * Sem total por mes de proposito. O Resumo tem o "Entrou", que deixa o vale de
 * fora (ver `ehDeCaixa`); uma segunda soma aqui, com outra definicao, voltaria
 * a produzir dois numeros quase iguais.
 */
function ListaReceitas({
  carregando,
  rendas,
  apelidos,
  abrir,
}: {
  carregando: boolean;
  rendas: ReturnType<typeof useFinanceiro>['dados']['rendas'];
  apelidos: ReadonlyMap<string, string>;
  abrir: (id: string) => void;
}) {
  if (carregando) return <p className="carregando">Carregando…</p>;

  const agora = Date.now();
  const lancamentos = lancamentosDeRenda(rendas, intervaloDoMes(chaveMes(agora)).fim);

  if (lancamentos.length === 0) {
    return (
      <p className="vazio">
        Nenhuma entrada ainda.
        <br />
        Cadastre seu salário uma vez e ele passa a contar todo mês sozinho.
      </p>
    );
  }

  const saida: React.ReactNode[] = [];
  let mesAnterior = '';

  for (const { chave, renda, quando } of lancamentos) {
    const mes = chaveMes(quando);
    if (mes !== mesAnterior) {
      mesAnterior = mes;
      saida.push(
        <li key={'mes-' + mes}>
          <h2 className="secao-titulo">{nomeMes(mes)}</h2>
        </li>,
      );
    }

    const recorrencia =
      renda.periodicidade === 'mensal'
        ? `todo dia ${new Date(renda.data).getDate()}`
        : renda.periodicidade === 'anual'
          ? 'todo ano'
          : 'única';
    const conta = renda.contaId ? apelidos.get(renda.contaId) : undefined;

    saida.push(
      <li key={chave}>
        <button type="button" className="compra" onClick={() => abrir(renda.id)}>
          <div className="compra-corpo">
            <div className="compra-titulo">{renda.origem || renda.descricao || 'Entrada'}</div>
            <div className="compra-meta">
              {formatarData(quando)} · {recorrencia}
              {renda.contaId && ` · cai em ${conta ?? 'outra conta'}`}
              {quando > agora && ' · ainda não caiu'}
            </div>
          </div>
          <span className="compra-valor">{formatarReais(renda.valor)}</span>
        </button>
      </li>,
    );
  }

  return <ul className="lista">{saida}</ul>;
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
  const mesAtual = visao.linhas[0]?.mes;
  const mesCheio = visao.linhas.find((linha) => !linha.parcial);

  return (
    <button type="button" className="previsao-linha" onClick={onTocar}>
      {/*
        "FECHA O MES COM", e nao mais "ainda sobra este mes".
        O numero antigo era a sobra do mes PARCIAL: o que falta entrar menos o
        que falta sair. No dia seguinte ao salario nao falta entrar nada, e ele
        ficava vermelho ate o fim do mes sem nada de ruim ter acontecido. O
        saldo previsto para o fim do mes nao da esse degrau, e e um saldo: nao
        disputa a palavra "sobra" com o Resumo e a Carteira — a tabela dos
        sentidos esta no topo de `compartilhado/carteira.ts`.

        Sem conta de dinheiro nao ha saldo de onde partir. Ai a linha mostra a
        sobra prevista de um mes cheio, que so depende das entradas.
      */}
      {visao.fechaOMesCom !== null && mesAtual ? (
        <span>
          fecha {soOMes(mesAtual)} com{' '}
          <strong className={visao.fechaOMesCom < 0 ? 'valor-ruim' : ''}>
            {formatarReais(visao.fechaOMesCom)}
          </strong>
        </span>
      ) : (
        mesCheio && (
          <span>
            sobra prevista em {soOMes(mesCheio.mes).slice(0, 3)}{' '}
            <strong className={mesCheio.sobra < 0 ? 'valor-ruim' : ''}>
              {formatarReais(mesCheio.sobra)}
            </strong>
          </span>
        )
      )}
      {mostraAperto && (
        <span className="previsao-aperto">
          aperto em {nomeMes(apertado.mes).slice(0, 3)}{' '}
          {limites.simuladorCompleto ? formatarReais(apertado.saldoAcumulado) : ''}
        </span>
      )}
    </button>
  );
}

/** "2026-10" -> "outubro". Na linha de previsao o ano so ocuparia espaco. */
function soOMes(chave: string): string {
  return nomeMes(chave).split(' ')[0] ?? '';
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
