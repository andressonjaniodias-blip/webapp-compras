/**
 * O resumo do mes — DUAS perguntas que esta tela respondia embaralhadas numa so.
 *
 *   1. quanto eu COMPREI no mes?   inclui credito; e o que passou no caixa da loja
 *   2. quanto SAIU do meu dinheiro? o fechamento de caixa, onde credito nao entra
 *
 * Antes havia um numero grande sem rotulo (a pergunta 1) e, logo abaixo, um bloco
 * de caixa (a pergunta 2) cujo "Saiu do caixa" era menor. Dois totais
 * concorrentes, nenhum dizendo o que era. Hoje sao dois cartoes com titulo.
 *
 * O RAZAO existe para a conta poder ser conferida A OLHO. A versao anterior
 * subtraia `aVencer` dentro da sobra e nunca o mostrava, entao "entrou 3.500,
 * saiu 1.200, sobra 900" nao fechava e nao havia como descobrir por que. Hoje
 * toda parcela da subtracao tem linha, e a regua separa o total. Quem
 * acrescentar um termo a `MesFinanceiro.sobra` precisa dar linha a ele aqui — o
 * teste "o razao do mes fecha", em `teste:contas`, falha se nao der.
 *
 * As contas sao feitas no aparelho, a partir do banco local — abrem na hora e
 * funcionam sem internet. So o botao de dicas fala com o servidor.
 */

import { contagem } from '../lib/texto';
import { Carregando } from '../componentes/Carregando';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listarCompras, listarTodosOsItens } from '../dados/compras';
import { useFinanceiro } from '../dados/financeiro';
import { listarAnalises, salvarAnaliseDoMes } from '../dados/financas';
import { mesesComMovimento, resumirMes } from '../lib/resumo';
import { compararNoMesmoPeriodo, historicoDePreco, mudancasDePreco, serieDeMeses } from '../lib/series';
import { extratoDeDividas, gastoComDividasNoMes, gastoTotalDoMes, resumoDoMes } from '../../compartilhado/carteira';
import { estimarGastoCorrente } from '../../compartilhado/previsao';
import { limitesDo } from '../../compartilhado/planos';
import { formatarReais } from '../lib/dinheiro';
import { apenasMes, formatarDataHora, mesAtual } from '../lib/datas';
import { pedirDicas } from '../dados/api';
import { useApp } from '../estado';
import { NavegadorDeMes } from '../componentes/NavegadorDeMes';
import { BarrasComparativas } from '../componentes/graficos/BarrasComparativas';
import { ColunasMensais } from '../componentes/graficos/ColunasMensais';
import { Cupom } from '../componentes/graficos/Cupom';
import { PrecosQueSubiram } from '../componentes/graficos/PrecosQueSubiram';
import { useVoltar } from '../lib/useVoltar';
import { RazaoDoCaixa, Linha } from '../componentes/resumo/RazaoDoCaixa';
import { Fatias } from '../componentes/resumo/Fatias';
import { ExemploDeAnalise } from '../componentes/resumo/ExemploDeAnalise';

export function Resumo() {
  const navegar = useNavigate();
  const voltar = useVoltar('/');
  const { iaLigada, modeloIa, offline, plano } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);
  const itens = useLiveQuery(listarTodosOsItens, [], undefined);
  const analisesSalvas = useLiveQuery(listarAnalises, [], undefined);
  const financeiro = useFinanceiro();

  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroDicas, setErroDicas] = useState<string | null>(null);

  if (compras === undefined || financeiro.carregando) {
    return (
      <div className="app" role="main">
        <Carregando />
      </div>
    );
  }

  const agora = Date.now();
  const limites = limitesDo(plano);
  const corrente = mesAtual();

  // O mes corrente entra na lista mesmo sem movimento nenhum: e o mes que a
  // pessoa abriu a tela para ver, e nao poder chegar nele seria absurdo.
  const comMovimento = mesesComMovimento(financeiro.dados, agora);
  const meses = comMovimento.includes(corrente) ? comMovimento : [corrente, ...comMovimento];

  const mes = mesEscolhido !== null && meses.includes(mesEscolhido) ? mesEscolhido : meses[0]!;
  const ehCorrente = mes === corrente;

  // A media dos meses completos, para comparar com o mes tipico. O `null`
  // forçado ignora o gasto manual de proposito: aqui a pergunta e "quanto eu
  // costumo gastar", que e historico, e nao "com quanto eu quero contar".
  const estimativa = estimarGastoCorrente(financeiro.dados, agora, null);
  const resumo = resumirMes(compras, mes, {
    contas: financeiro.dados.contas,
    tipico: estimativa.mesesUsados > 0 ? estimativa.total : null,
  });

  const caixa = financeiro.mostrar ? resumoDoMes(financeiro.dados, mes, agora) : null;

  // Os graficos so desenham: cada numero sai de `lib/series.ts`, e de la das
  // mesmas funcoes que o resto da tela usa. A serie termina no mes corrente, e
  // nao no escolhido, para a janela nao andar quando se toca numa coluna.
  const serie = serieDeMeses(compras, corrente, 6, agora);
  const comparacao = compararNoMesmoPeriodo(compras, mes, agora);
  const precos = itens ? mudancasDePreco(historicoDePreco(itens, compras)) : [];

  // O que os emprestimos e financiamentos ja custaram no mes (descontado ou pago),
  // para o total de gastos. So apresentacao: "Comprei" e a sobra nao mudam.
  const dividasDoMes =
    !financeiro.modoSimples && financeiro.temDividas
      ? gastoComDividasNoMes(extratoDeDividas(financeiro.dados, agora), mes)
      : { total: 0, parcelas: 0 };

  // A analise salva do mes escolhido. Ela continua na tela enquanto a nova e
  // pedida: se o pedido falhar, a antiga nao se perde.
  const analise = analisesSalvas?.find((a) => a.mes === mes) ?? null;
  const dicas = analise?.dicas ?? null;
  const analiseVelha =
    analise !== null && (analise.comprasNoMes !== resumo.quantidade || analise.totalNoMes !== resumo.total);

  function escolherMes(destino: string) {
    setMesEscolhido(destino);
    setErroDicas(null);
  }

  async function analisar() {
    setAnalisando(true);
    setErroDicas(null);
    try {
      const novas = await pedirDicas(mes);
      await salvarAnaliseDoMes({
        mes,
        geradaEm: Date.now(),
        modelo: modeloIa,
        comprasNoMes: resumo.quantidade,
        totalNoMes: resumo.total,
        dicas: novas,
      });
    } catch (falha) {
      setErroDicas(falha instanceof Error ? falha.message : 'Não foi possível analisar.');
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <div className="app" role="main">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={voltar}>
            ‹
          </button>
          <h1>Resumo</h1>
        </div>
      </header>

      <NavegadorDeMes meses={meses} mes={mes} onChange={escolherMes} />

      {caixa && (
        <RazaoDoCaixa caixa={caixa} ehCorrente={ehCorrente} temRenda={financeiro.temRenda} />
      )}

      {serie.length > 0 && (
        <>
          <h2 className="secao-titulo">Os últimos meses</h2>
          <section className="cartao">
            <ColunasMensais
              serie={serie}
              tipico={estimativa.mesesUsados > 0 ? estimativa.total : null}
              selecionado={mes}
              aoEscolher={escolherMes}
            />
          </section>
        </>
      )}

      <h2 className="secao-titulo">
        {dividasDoMes.parcelas > 0 ? 'O que eu gastei' : 'O que eu comprei'}
      </h2>
      <section className="cartao">
        <div className="razao-linha razao-total">
          <span />
          <span>Comprei em {apenasMes(mes)}</span>
          <span className="razao-valor">{formatarReais(resumo.total)}</span>
        </div>

        {caixa && resumo.total > 0 && (
          <>
            {caixa.saidasAVista > 0 && (
              <Linha filha rotulo="à vista, débito ou Pix" valor={caixa.saidasAVista} />
            )}
            {caixa.noCredito > 0 && (
              <Linha filha rotulo="no crédito" dica="(vira fatura)" valor={caixa.noCredito} />
            )}
            {caixa.noVale > 0 && <Linha filha rotulo="no vale" valor={caixa.noVale} />}
            {caixa.semConta > 0 && (
              <Linha filha rotulo="sem conta definida" valor={caixa.semConta} />
            )}
          </>
        )}

        {dividasDoMes.parcelas > 0 && (
          <>
            <Linha
              sinal="+"
              rotulo="Empréstimos e financiamentos"
              dica="(já descontados ou pagos)"
              valor={dividasDoMes.total}
            />
            <div className="razao-linha razao-total">
              <span />
              <span>Gastei em {apenasMes(mes)}</span>
              <span className="razao-valor">{formatarReais(gastoTotalDoMes(resumo.total, dividasDoMes))}</span>
            </div>
          </>
        )}

        {resumo.quantidade > 0 && (
          <p className="dica">
            {contagem(resumo.quantidade, 'compra', 'compras')} · média de {formatarReais(resumo.media)}
          </p>
        )}

        {resumo.maiorCompra !== null && resumo.quantidade > 1 && (
          <button
            type="button"
            className="fatia-abrir dica"
            onClick={() => navegar('/compra/' + resumo.maiorCompra!.id)}
          >
            Maior compra:{' '}
            {resumo.maiorCompra.descricao || resumo.maiorCompra.categoria || 'sem descrição'} —{' '}
            <strong>{formatarReais(resumo.maiorCompra.total)}</strong> ›
          </button>
        )}

        {resumo.comparadoAoTipico !== null && resumo.tipico !== null && (
          <p className={'dica ' + (resumo.comparadoAoTipico > 0 ? 'subiu' : 'caiu')}>
            {resumo.comparadoAoTipico > 0 ? '▲' : '▼'}{' '}
            {formatarReais(Math.abs(resumo.comparadoAoTipico))}{' '}
            {resumo.comparadoAoTipico > 0 ? 'acima' : 'abaixo'} do mês típico (
            {formatarReais(resumo.tipico)}, média de {contagem(estimativa.mesesUsados, 'mês', 'meses')}, sem contar
            categorias eventuais)
          </p>
        )}

        {resumo.variacao !== null && resumo.totalAnterior !== null && (
          <p className={'dica ' + (resumo.variacao > 0 ? 'subiu' : 'caiu')}>
            {resumo.variacao > 0 ? '▲' : '▼'} {formatarReais(Math.abs(resumo.variacao))} em relação
            ao mês anterior ({formatarReais(resumo.totalAnterior)})
          </p>
        )}

        {caixa !== null && caixa.noCredito > 0 && (
          <p className="dica">
            {caixa.adiadoEmParcelas > 0 ? (
              <>
                Dos {formatarReais(caixa.noCredito)} no crédito,{' '}
                {formatarReais(caixa.adiadoEmParcelas)} viram parcela de meses seguintes — por isso
                este número e o da Carteira não batem, e nenhum dos dois está errado.
              </>
            ) : (
              <>
                Os {formatarReais(caixa.noCredito)} no crédito ainda não saíram de conta nenhuma:
                eles saem quando a fatura é paga.
              </>
            )}
          </p>
        )}
      </section>

      {resumo.quantidade === 0 && <p className="vazio">Nenhuma compra neste mês.</p>}

      {resumo.porCategoria.length > 0 && (
        <>
          <h2 className="secao-titulo">Por categoria</h2>
          <Cupom
            fatias={resumo.porCategoria}
            total={resumo.total}
            rotuloDoTotal={'Comprei em ' + apenasMes(mes)}
            mostrarDelta={!ehCorrente}
            abrirCompra={(id) => navegar('/compra/' + id)}
          />
        </>
      )}

      <details className="macro">
        <summary>
          <span>Comparação com o mês passado, preços e contas</span>
        </summary>

      {comparacao && (
        <>
          <h2 className="secao-titulo">
            {apenasMes(mes)} contra {apenasMes(comparacao.anterior)}
          </h2>
          <section className="cartao">
            <p className="dica sem-topo">
              {comparacao.ateODia !== null
                ? `Os dois meses até o dia ${comparacao.ateODia}, para a conta ser justa.`
                : 'Os dois meses inteiros.'}
            </p>
            <BarrasComparativas
              comparacao={comparacao}
              nomeAtual={apenasMes(mes)}
              nomeAnterior={apenasMes(comparacao.anterior)}
            />
            <p className="dica">
              Ao todo: {formatarReais(comparacao.totalAtual)} contra{' '}
              {formatarReais(comparacao.totalAnterior)}.
            </p>
          </section>
        </>
      )}

      {precos.length > 0 && (
        <>
          <h2 className="secao-titulo">O que subiu no seu carrinho</h2>
          <section className="cartao">
            <PrecosQueSubiram historicos={precos} />
            <p className="dica">Preço por unidade, nas últimas compras de cada item.</p>
          </section>
        </>
      )}

      {resumo.porConta.length > 0 && (
        <Fatias
          titulo="Por conta"
          legenda="de onde cada compra saiu, ou vai sair"
          fatias={resumo.porConta}
          abrir={(id) => navegar('/compra/' + id)}
        />
      )}

      {resumo.porConta.length === 0 && resumo.porFormaPagamento.length > 0 && (
        <Fatias
          titulo="Por forma de pagamento"
          legenda="o texto digitado na compra, não a conta"
          fatias={resumo.porFormaPagamento}
          abrir={(id) => navegar('/compra/' + id)}
        />
      )}
      </details>

      <h2 className="secao-titulo">Orçamento do ano</h2>
      <button type="button" className="botao botao-largo" onClick={() => navegar('/orcamento')}>
        Planejar o orçamento anual
      </button>

      <h2 className="secao-titulo">Dicas de economia</h2>

      {!limites.ia && <ExemploDeAnalise />}

      {limites.ia && !iaLigada && (
        <p className="dica">
          As dicas estão indisponíveis no momento: falta configurar a chave da Anthropic no
          servidor. O resumo acima continua funcionando normalmente.
        </p>
      )}

      {limites.ia && iaLigada && (
        <>
          <button
            type="button"
            className="botao botao-largo"
            disabled={analisando || resumo.quantidade === 0 || offline}
            onClick={analisar}
          >
            {analisando
              ? 'Analisando o mês…'
              : (analise ? 'Refazer a análise de ' : 'Analisar ') + apenasMes(mes)}
          </button>
          {offline && <p className="dica">Precisa de internet para analisar.</p>}
        </>
      )}

      {erroDicas && <p className="aviso aviso-erro topo-12" role="alert">{erroDicas}</p>}

      {analise && dicas && (
        <div className="topo-12">
          <p className="dica">Análise feita em {formatarDataHora(analise.geradaEm)}.</p>
          {analiseVelha && (
            <p className="aviso">
              As compras deste mês mudaram desde esta análise. Refaça para atualizar.
            </p>
          )}

          <div className="cartao">{dicas.resumo}</div>

          {dicas.achados.map((achado, indiceAchado) => (
            <div className="cartao" key={indiceAchado}>
              <strong>{achado.titulo}</strong>
              <p className="texto">{achado.detalhe}</p>
              {achado.economiaEstimadaCentavos !== null && achado.economiaEstimadaCentavos > 0 && (
                <span className="selo selo-pendente">
                  economia estimada {formatarReais(achado.economiaEstimadaCentavos)}/mês
                </span>
              )}
            </div>
          ))}

          {dicas.previsao && (
            <div className="cartao">
              <strong>Daqui para frente</strong>
              <p className="texto">{dicas.previsao}</p>
            </div>
          )}

          {dicas.metas && (
            <div className="cartao">
              <strong>Suas metas</strong>
              <p className="texto">{dicas.metas}</p>
            </div>
          )}

          {dicas.sugestoes.length > 0 && (
            <div className="cartao">
              <strong>O que fazer</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {dicas.sugestoes.map((sugestao, indiceSugestao) => (
                  <li key={indiceSugestao}>{sugestao}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
