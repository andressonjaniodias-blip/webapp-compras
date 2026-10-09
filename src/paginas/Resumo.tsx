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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listarCompras } from '../dados/compras';
import { useFinanceiro } from '../dados/financeiro';
import { mesesComMovimento, resumirMes, type FatiaResumo } from '../lib/resumo';
import {
  extratoDeDividas,
  gastoComDividasNoMes,
  resumoDoMes,
  type MesFinanceiro,
} from '../../compartilhado/carteira';
import { estimarGastoCorrente } from '../../compartilhado/previsao';
import { limitesDo } from '../../compartilhado/planos';
import { formatarReais } from '../lib/dinheiro';
import { formatarData, mesAtual, nomeMes } from '../lib/datas';
import { pedirDicas, type Dicas } from '../dados/api';
import { useApp } from '../estado';
import { NavegadorDeMes } from '../componentes/NavegadorDeMes';
import { useVoltar } from '../lib/useVoltar';

/** Quantas categorias aparecem antes do resto virar "outras". */
const CATEGORIAS_VISIVEIS = 6;

/** "2026-09" -> "setembro". O ano so atrapalha num rotulo de uma linha. */
function apenasMes(chave: string): string {
  return nomeMes(chave).replace(/ de \d{4}$/, '');
}

export function Resumo() {
  const navegar = useNavigate();
  const voltar = useVoltar('/');
  const { iaLigada, offline, plano } = useApp();
  const compras = useLiveQuery(listarCompras, [], undefined);
  const financeiro = useFinanceiro();

  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [dicas, setDicas] = useState<Dicas | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroDicas, setErroDicas] = useState<string | null>(null);

  if (compras === undefined || financeiro.carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
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

  // O que os emprestimos e financiamentos ja custaram no mes (descontado ou pago),
  // para o total de gastos. So apresentacao: "Comprei" e a sobra nao mudam.
  const dividasDoMes =
    !financeiro.modoSimples && financeiro.temDividas
      ? gastoComDividasNoMes(extratoDeDividas(financeiro.dados, agora), mes)
      : { total: 0, parcelas: 0 };

  function escolherMes(destino: string) {
    setMesEscolhido(destino);
    setDicas(null);
    setErroDicas(null);
  }

  async function analisar() {
    setAnalisando(true);
    setErroDicas(null);
    setDicas(null);
    try {
      setDicas(await pedirDicas(mes));
    } catch (falha) {
      setErroDicas(falha instanceof Error ? falha.message : 'Não foi possível analisar.');
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <div className="app">
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
              <span className="razao-valor">{formatarReais(resumo.total + dividasDoMes.total)}</span>
            </div>
          </>
        )}

        {resumo.quantidade > 0 && (
          <p className="dica">
            {resumo.quantidade} compra(s) · média de {formatarReais(resumo.media)}
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
            {formatarReais(resumo.tipico)}, média de {estimativa.mesesUsados} mês(es), sem contar
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
        <Fatias
          titulo="Por categoria"
          legenda="do total comprado, comparado ao mês anterior"
          fatias={resumo.porCategoria}
          abrir={(id) => navegar('/compra/' + id)}
        />
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
            {analisando ? 'Analisando o mês…' : 'Analisar ' + apenasMes(mes)}
          </button>
          {offline && <p className="dica">Precisa de internet para analisar.</p>}
        </>
      )}

      {erroDicas && <p className="aviso aviso-erro" style={{ marginTop: 12 }}>{erroDicas}</p>}

      {dicas && (
        <div style={{ marginTop: 12 }}>
          <div className="cartao">{dicas.resumo}</div>

          {dicas.achados.map((achado, indiceAchado) => (
            <div className="cartao" key={indiceAchado}>
              <strong>{achado.titulo}</strong>
              <p className="dica" style={{ color: 'var(--texto)' }}>{achado.detalhe}</p>
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
              <p className="dica" style={{ color: 'var(--texto)' }}>{dicas.previsao}</p>
            </div>
          )}

          {dicas.metas && (
            <div className="cartao">
              <strong>Suas metas</strong>
              <p className="dica" style={{ color: 'var(--texto)' }}>{dicas.metas}</p>
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

/**
 * O fechamento de caixa, como subtracao conferivel.
 *
 * Cada linha e guardada pelo SEU dado, e nao o cartao inteiro por `temRenda`.
 * Antes o bloco todo exigia renda cadastrada, e quem tinha contas e cartoes sem
 * renda nao via nem "saiu do caixa" — mas o Princípio 0 diz que numero vem de
 * DADO, e o dado de "saiu do caixa" e compra mais conta, que existiam.
 *
 * `aVencer` fica FORA da subtracao, embaixo da regua: ele e o que vence e ainda
 * nao foi pago, ou seja, dinheiro que continua na conta. Some-lo a sobra era o
 * bug que fazia o mes passado de quem registra pagamento parcial parecer PIOR
 * que o de quem nunca registrou nada.
 *
 * O VALE fica fora dos dois lados: a recarga nao e "Entrou" e a compra feita
 * com ele nao e saida, porque vale nao paga fatura. So o que a conta manda para
 * ele tem linha na subtracao. A frase no fim do cartao diz para onde foi o
 * numero que a pessoa esperava ver em "Entrou".
 */
function RazaoDoCaixa({
  caixa,
  ehCorrente,
  temRenda,
}: {
  caixa: MesFinanceiro;
  ehCorrente: boolean;
  temRenda: boolean;
}) {
  const temSaida =
    caixa.saidasAVista > 0 ||
    caixa.pagamentos > 0 ||
    caixa.descontoEmFolha > 0 ||
    caixa.enviadoAoVale > 0;
  if (!temRenda && !temSaida) return null;

  return (
    <>
      <h2 className="secao-titulo">O que saiu do meu dinheiro</h2>
      <section className="cartao">
        {temRenda && <Linha rotulo="Entrou" valor={caixa.entradas} />}
        {caixa.saidasAVista > 0 && (
          <Linha sinal="−" rotulo="Compras à vista, débito ou Pix" valor={caixa.saidasAVista} />
        )}
        {caixa.pagamentos > 0 && (
          <Linha sinal="−" rotulo="Faturas e parcelas pagas" valor={caixa.pagamentos} />
        )}
        {caixa.descontoEmFolha > 0 && (
          <Linha sinal="−" rotulo="Descontado em folha" valor={caixa.descontoEmFolha} />
        )}
        {caixa.enviadoAoVale > 0 && (
          <Linha sinal="−" rotulo="Enviado para o vale" valor={caixa.enviadoAoVale} />
        )}

        {temRenda && (
          <>
            <hr className="razao-regua" />
            <div className="razao-linha razao-total">
              <span>=</span>
              <span>{ehCorrente ? 'Sobra até agora' : 'Sobrou em ' + apenasMes(caixa.mes)}</span>
              <span className={'razao-valor ' + (caixa.sobra < 0 ? 'valor-ruim' : 'valor-bom')}>
                {formatarReais(caixa.sobra)}
              </span>
            </div>
          </>
        )}

        {caixa.aVencer > 0 && (
          <>
            <hr className="razao-regua" />
            <Linha
              rotulo={ehCorrente ? 'Ainda vence neste mês' : 'Ficou em aberto'}
              valor={caixa.aVencer}
            />
            <p className="dica">
              {ehCorrente
                ? 'Esse dinheiro ainda está na conta, então não entra na subtração acima.'
                : 'Não foi pago, então não saiu da conta — fica fora da subtração acima.'}
            </p>
          </>
        )}

        {caixa.presumido && (
          <p className="dica">
            Competências vencidas sem pagamento registrado contam como pagas por presunção. Se
            algo ficou no rotativo, registre o pagamento real para o número refletir isso.
          </p>
        )}

        {caixa.noCredito > 0 && (
          <p className="dica">
            Os {formatarReais(caixa.noCredito)} comprados no crédito não aparecem aqui de
            propósito: no mês da compra eles não saíram de conta nenhuma.
          </p>
        )}

        {(caixa.entradasNoVale > 0 || caixa.noVale > 0) && (
          <p className="dica">
            O vale fica fora desta conta:{' '}
            {caixa.entradasNoVale > 0 && <>entraram {formatarReais(caixa.entradasNoVale)} nele</>}
            {caixa.entradasNoVale > 0 && caixa.noVale > 0 && ' e '}
            {caixa.noVale > 0 && <>{formatarReais(caixa.noVale)} foram gastos com ele</>}. Ele só
            compra comida, então não paga fatura nem vira dinheiro.
          </p>
        )}
      </section>
    </>
  );
}

/** Uma linha do razao. O sinal em coluna propria faz a subtracao ser legivel. */
function Linha({
  sinal,
  rotulo,
  dica,
  valor,
  filha,
}: {
  sinal?: string;
  rotulo: string;
  dica?: string;
  valor: number;
  filha?: boolean;
}) {
  return (
    <div className={'razao-linha' + (filha ? ' razao-linha-filha' : '')}>
      <span className="razao-sinal">{sinal ?? ''}</span>
      <span>
        {rotulo}
        {dica !== undefined && <span className="dica"> {dica}</span>}
      </span>
      <span className="razao-valor">{formatarReais(valor)}</span>
    </div>
  );
}

/**
 * Uma secao de fatias, com teto e com as compras por tras de cada numero.
 *
 * O teto existe porque sao 17 categorias possiveis: renderizar todas virava uma
 * parede de barras em que nao se achava nada. E a expansao existe porque resumo
 * em que nao se pode entrar e resumo que se para de conferir — o numero afirmava
 * "Mercado R$ 800" e nao havia caminho nenhum ate as compras que somavam isso.
 */
function Fatias({
  titulo,
  legenda,
  fatias,
  abrir,
}: {
  titulo: string;
  legenda: string;
  fatias: readonly FatiaResumo[];
  abrir: (id: string) => void;
}) {
  const [tudo, setTudo] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const visiveis = tudo ? fatias : fatias.slice(0, CATEGORIAS_VISIVEIS);
  const restantes = fatias.length - visiveis.length;

  return (
    <>
      <h2 className="secao-titulo">{titulo}</h2>
      <div className="cartao">
        <p className="dica" style={{ marginTop: 0 }}>{legenda}</p>

        {visiveis.map((fatia) => (
          <div className="fatia" key={fatia.nome}>
            <button
              type="button"
              className="fatia-abrir"
              aria-expanded={aberta === fatia.nome}
              onClick={() => setAberta(aberta === fatia.nome ? null : fatia.nome)}
            >
              <div className="fatia-linha">
                <span>
                  {fatia.nome}
                  {fatia.delta !== null && fatia.delta !== 0 && (
                    <span className={'fatia-delta ' + (fatia.delta > 0 ? 'subiu' : 'caiu')}>
                      {fatia.delta > 0 ? '▲' : '▼'} {formatarReais(Math.abs(fatia.delta))}
                    </span>
                  )}
                </span>
                <span>
                  {formatarReais(fatia.total)} · {fatia.percentual.toFixed(0)}%
                </span>
              </div>
              <div className="barra">
                <div className="barra-preenchida" style={{ width: fatia.percentual + '%' }} />
              </div>
            </button>

            {aberta === fatia.nome && (
              <ul className="lista fatia-compras">
                {fatia.compras
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((compra) => (
                    <li key={compra.id}>
                      <button type="button" className="compra" onClick={() => abrir(compra.id)}>
                        <div className="compra-corpo">
                          <div className="compra-titulo">
                            {compra.descricao || compra.categoria || 'sem descrição'}
                          </div>
                          <div className="compra-meta">{formatarData(compra.data)}</div>
                        </div>
                        <span className="compra-valor">{formatarReais(compra.total)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ))}

        {restantes > 0 && (
          <button type="button" className="botao botao-largo" onClick={() => setTudo(true)}>
            Ver outras {restantes}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * O exemplo estatico da analise, para o plano gratis.
 *
 * E texto fixo: NAO chama a API. Custa zero e mostra melhor o que o plano pago
 * entrega do que uma amostra que expira — e, num projeto que roda em free tier
 * permanente, esse custo zero e o que torna o exemplo possivel.
 *
 * Fica RECOLHIDO porque sao dois cartoes de exemplo competindo por altura de
 * tela com o dado real de quem ja esta ali para conferir o proprio mes.
 */
function ExemploDeAnalise() {
  return (
    <details>
      <summary className="dica">
        <span className="selo selo-plano">plano pago</span> A análise lê o mês inteiro com os
        itens, compara com o anterior e olha os próximos doze meses. Ver um exemplo.
      </summary>
      <div className="cartao cartao-exemplo">
        <strong>Arroz subiu 20% em dois meses</strong>
        <p className="dica" style={{ color: 'var(--texto)' }}>
          O arroz de 5 kg passou de R$ 24,90 em julho para R$ 29,90 em agosto, e ele aparece em
          três das quatro compras de mercado do mês.
        </p>
        <span className="selo selo-pendente">economia estimada R$ 20,00/mês</span>
      </div>
      <div className="cartao cartao-exemplo">
        <strong>Daqui para frente</strong>
        <p className="dica" style={{ color: 'var(--texto)' }}>
          Com as parcelas já contratadas, dá para comprometer cerca de R$ 380 por mês sem
          estourar. O mês mais apertado é novembro, quando a fatura sobe por causa das parcelas
          da geladeira.
        </p>
      </div>
    </details>
  );
}
