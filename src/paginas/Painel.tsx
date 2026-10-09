/**
 * A tela inicial de quem ja tem lado financeiro: um painel, com o resumo de cada
 * pagina e um botao para a pagina inteira.
 *
 * NO TOPO, UM DESTAQUE. O numero que muda decisao ("fecha outubro com…") e o
 * botao "Posso comprar isto?" pesam mais que o resto; seis cartoes do mesmo
 * tamanho dariam o mesmo peso a lista de receitas e ao saldo previsto. Abaixo,
 * seis cartoes menores numa grade que se adapta a largura (duas colunas no
 * celular, sem media query nova).
 *
 * CADA NUMERO VEM DA MESMA FUNCAO QUE A PAGINA DE DESTINO USA, nunca de uma
 * conta feita aqui. O app ja teve quatro numeros chamados "sobra" (ver o topo de
 * `compartilhado/carteira.ts`), e um painel que recalcula e a forma mais rapida
 * de criar o quinto. Por isso nao ha aqui o "quanto saiu no mes" — e uma soma de
 * quatro termos que a Carteira e o Resumo ja listam —, e o saldo e o
 * `saldoEmConta`, que deixa o vale de fora; somar `contas[].saldo` a mao o
 * inflaria.
 *
 * PRINCÍPIO 0: o painel so existe quando ja ha conta ou entrada (`mostrar`);
 * antes disso a tela inicial e a lista de compras de sempre. Cartao sem dado
 * mostra uma frase neutra e nenhum numero, e continua tocavel: e a porta para
 * cadastrar. Os cartoes sao as portas do lado financeiro, entao o 💳 e o ▦ do
 * cabecalho nao se repetem aqui.
 *
 * "Nova compra" continua fixo no rodape: no mercado, e o caminho que nao pode
 * ganhar um toque a mais.
 */

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { criarCompra, listarCompras } from '../dados/compras';
import type { EstadoFinanceiro } from '../dados/financeiro';
import {
  entradaEmDestaque,
  resumoDoMes,
  terminaEm,
} from '../../compartilhado/carteira';
import { limitesDo } from '../../compartilhado/planos';
import { panorama, planejarMeta, temBaseDeEntrada } from '../../compartilhado/previsao';
import { formatarReais } from '../lib/dinheiro';
import { chaveMes, formatarDataCurta, nomeMes } from '../lib/datas';
import { resumirMes } from '../lib/resumo';
import { useApp } from '../estado';
import { BarraSituacao } from '../componentes/BarraSituacao';

export function Painel({ financeiro }: { financeiro: EstadoFinanceiro }) {
  const navegar = useNavigate();
  const { atualizarPendentes, plano } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);
  const { dados, gastoManual, entradaManual, temRenda, temContas, temDividas } = financeiro;

  const agora = Date.now();
  const mes = chaveMes(agora);
  const limites = limitesDo(plano);

  // Uma chamada so, repartida entre o destaque, a Carteira e as Metas: o
  // horizonte e o que a tela inicial ja usava.
  const visao = panorama(dados, {
    meses: Math.max(12, limites.mesesDePrevisao),
    agora,
    gastoManual,
    entradaManual,
  });
  const temBase = temBaseDeEntrada(visao.estimativaEntrada);
  const mesCorrente = resumoDoMes(dados, mes, agora);

  async function nova() {
    const id = await criarCompra();
    await atualizarPendentes();
    navegar('/compra/' + id);
  }

  // ---- Compras: o "Comprei no mes" do Resumo, e as duas mais recentes.
  const totalDoMes = compras ? resumirMes(compras, mes).total : null;
  const recentes = (compras ?? []).slice(0, 2);

  // ---- Receitas: a ultima que caiu e a proxima que vai cair.
  const { ultima, proxima } = entradaEmDestaque(dados.rendas, agora);

  // ---- Emprestimos: o bloco "Empréstimos" da Carteira, somado.
  const dividas = visao.carteira.compromissos.filter((c) => c.origem === 'divida');
  const restanteDasDividas = dividas.reduce((soma, c) => soma + c.falta.restante, 0);
  const ateQuando = terminaEm(dividas);

  // ---- Metas: a primeira, com o progresso que a pagina de Metas calcula.
  const sobraMensal = visao.linhas.find((l) => !l.parcial)?.sobra ?? visao.sobraDoMes;
  const meta = dados.metas[0];
  const planoDaMeta = meta ? planejarMeta(meta, sobraMensal, agora) : null;

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <h1>Compras</h1>
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
      </header>

      <Destaque
        visao={visao}
        mostrarNumero={temBase}
        simuladorCompleto={limites.simuladorCompleto}
        onSimular={() => navegar('/simular')}
      />

      <div className="painel">
        <Cartao titulo="Compras" ver="Ver todas" onAbrir={() => navegar('/compras')}>
          {totalDoMes === null ? null : recentes.length === 0 ? (
            <span className="dica">Nenhuma compra ainda.</span>
          ) : (
            <>
              <span className="painel-numero">{formatarReais(totalDoMes)}</span>
              <span className="dica">em {soOMes(mes)}</span>
              {recentes.map((compra) => (
                <span className="painel-linha" key={compra.id}>
                  <span>{compra.descricao || compra.categoria}</span>
                  <span>{formatarReais(compra.total)}</span>
                </span>
              ))}
            </>
          )}
        </Cartao>

        <Cartao titulo="Receitas" ver="Ver todas" onAbrir={() => navegar('/receitas')}>
          {ultima === null && proxima === null ? (
            <span className="dica">Nenhuma entrada ainda.</span>
          ) : (
            <>
              {ultima && (
                <>
                  <span className="painel-numero">{formatarReais(ultima.valor)}</span>
                  <span className="dica">
                    {ultima.origem || 'Entrada'} · caiu {formatarDataCurta(ultima.data)}
                  </span>
                </>
              )}
              {proxima && (
                <span className="dica">
                  próxima: {proxima.origem || 'Entrada'}, {formatarDataCurta(proxima.data)}
                </span>
              )}
            </>
          )}
        </Cartao>

        <Cartao titulo="Este mês" ver="Ver resumo" onAbrir={() => navegar('/resumo')}>
          {temRenda ? (
            <>
              <span className="dica">sobra até agora</span>
              <span className={'painel-numero ' + (mesCorrente.sobra < 0 ? 'valor-ruim' : 'valor-bom')}>
                {formatarReais(mesCorrente.sobra)}
              </span>
              <span className="dica">entraram {formatarReais(mesCorrente.entradas)}</span>
            </>
          ) : (
            <>
              <span className="dica">comprei em {soOMes(mes)}</span>
              <span className="painel-numero">
                {totalDoMes === null ? '' : formatarReais(totalDoMes)}
              </span>
            </>
          )}
        </Cartao>

        <Cartao titulo="Carteira" ver="Abrir" onAbrir={() => navegar('/carteira')}>
          {temContas ? (
            <>
              <span className="dica">em conta</span>
              <span className="painel-numero">{formatarReais(visao.carteira.saldoEmConta)}</span>
              {mesCorrente.aVencer > 0 && (
                <span className="dica">vencem {formatarReais(mesCorrente.aVencer)} este mês</span>
              )}
            </>
          ) : (
            <span className="dica">Cadastre uma conta para ver o saldo.</span>
          )}
        </Cartao>

        <Cartao titulo="Empréstimos" ver="Abrir" onAbrir={() => navegar('/dividas')}>
          {temDividas ? (
            <>
              <span className="dica">ainda falta pagar</span>
              <span className="painel-numero">{formatarReais(restanteDasDividas)}</span>
              {ateQuando && <span className="dica">até {nomeMes(ateQuando)}</span>}
            </>
          ) : (
            <span className="dica">Nenhum empréstimo.</span>
          )}
        </Cartao>

        <Cartao titulo="Metas" ver="Abrir" onAbrir={() => navegar('/metas')}>
          {meta && planoDaMeta ? (
            <>
              <span className="painel-linha">
                <span>{meta.descricao || 'Sem nome'}</span>
              </span>
              <span className="barra">
                <span
                  className="barra-preenchida"
                  style={{ width: planoDaMeta.progresso * 100 + '%', display: 'block' }}
                />
              </span>
              <span className="dica">
                {formatarReais(meta.guardado)} de {formatarReais(meta.valorAlvo)}
                {dados.metas.length > 1 && ` · +${dados.metas.length - 1}`}
              </span>
            </>
          ) : (
            <span className="dica">Nenhuma meta ainda.</span>
          )}
        </Cartao>
      </div>

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={nova}>
          Nova compra
        </button>
      </div>
    </div>
  );
}

/**
 * O numero que muda decisao e a porta para a pergunta que o app existe para
 * responder. So mostra o numero quando ha entrada cadastrada; sem ela, so o
 * botao (Principio 0).
 */
function Destaque({
  visao,
  mostrarNumero,
  simuladorCompleto,
  onSimular,
}: {
  visao: ReturnType<typeof panorama>;
  mostrarNumero: boolean;
  simuladorCompleto: boolean;
  onSimular: () => void;
}) {
  const apertado = visao.mesMaisApertado;
  const mostraAperto = apertado !== null && apertado.saldoAcumulado < visao.carteira.saldoEmConta;
  const mesAtual = visao.linhas[0]?.mes;
  const mesCheio = visao.linhas.find((linha) => !linha.parcial);

  return (
    <section className="cartao painel-destaque">
      {/*
        "FECHA O MES COM", e nao "ainda sobra este mes": o numero antigo era a
        sobra do mes PARCIAL e ficava vermelho no dia seguinte ao salario sem nada
        de ruim ter acontecido. Sem conta de dinheiro nao ha saldo de onde partir;
        ai mostra a sobra prevista de um mes cheio, que so depende das entradas.
      */}
      {mostrarNumero && visao.fechaOMesCom !== null && mesAtual && (
        <>
          <span className="campo-rotulo">fecha {soOMes(mesAtual)} com</span>
          <div className={'total-grande ' + (visao.fechaOMesCom < 0 ? 'valor-ruim' : '')}>
            {formatarReais(visao.fechaOMesCom)}
          </div>
        </>
      )}
      {mostrarNumero && visao.fechaOMesCom === null && mesCheio && (
        <>
          <span className="campo-rotulo">sobra prevista em {soOMes(mesCheio.mes).slice(0, 3)}</span>
          <div className={'total-grande ' + (mesCheio.sobra < 0 ? 'valor-ruim' : '')}>
            {formatarReais(mesCheio.sobra)}
          </div>
        </>
      )}
      {mostrarNumero && mostraAperto && (
        <p className="dica previsao-aperto">
          aperto em {nomeMes(apertado.mes).slice(0, 3)}{' '}
          {simuladorCompleto ? formatarReais(apertado.saldoAcumulado) : ''}
        </p>
      )}
      <button type="button" className="botao botao-primario botao-largo" onClick={onSimular}>
        Posso comprar isto?
      </button>
    </section>
  );
}

/**
 * Um cartao inteiro e UM botao: o alvo e grande e nao ha botao dentro de botao.
 * A linha "Ver todas ›" so avisa que o cartao leva a algum lugar.
 */
function Cartao({
  titulo,
  ver,
  onAbrir,
  children,
}: {
  titulo: string;
  ver: string;
  onAbrir: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="painel-cartao" onClick={onAbrir}>
      <span className="painel-titulo">{titulo}</span>
      <span className="painel-corpo">{children}</span>
      <span className="painel-ver">{ver} ›</span>
    </button>
  );
}

/** "2026-10" -> "outubro". No cartao o ano so ocuparia espaco. */
function soOMes(chave: string): string {
  return nomeMes(chave).split(' ')[0] ?? '';
}
