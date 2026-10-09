/**
 * A Carteira: quanto tem, quanto falta e como ficam os proximos meses.
 *
 * Sem conta e sem renda ela nao mostra saldo nenhum: vira a tela de ativacao do
 * modulo (ver `Ativacao`, no fim do arquivo). O Princípio 0 continua valendo no
 * que importa — quem so quer anotar compras nunca ve numero financeiro nenhum —,
 * mas o CAMINHO ate aqui agora existe sempre, porque esconder a porta escondia
 * junto o unico jeito de cadastrar a primeira conta.
 *
 * A ordem da tela e a ordem das perguntas: quanto tenho hoje, quanto ja devo,
 * como fica daqui para frente. A premissa do gasto estimado fica editavel ao
 * lado da propria previsao, porque numero de previsao que nao da para corrigir
 * nao e usado duas vezes.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { TabelaPrevisao } from '../componentes/TabelaPrevisao';
import { limitesDo } from '../../compartilhado/planos';
import { mesesAteAMetaMaisLonga, panorama, temBaseDeEntrada } from '../../compartilhado/previsao';
import { resumoDoMes } from '../../compartilhado/carteira';
import { chaveDoMes } from '../../compartilhado/fatura';
import { podeEnviar, podeReceber } from '../../compartilhado/tipos';
import { gravarEntradaManual, gravarGastoManual } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { formatarData, nomeMes } from '../lib/datas';
import { useApp } from '../estado';
import { Situacao } from './Fatura';

/** O horizonte calculado e sempre este; o plano decide quanto dele e LIDO. */
const HORIZONTE = 12;

export function Carteira() {
  const navegar = useNavigate();
  const { plano, ultimaEm, situacao, sincronizarAgora } = useApp();
  const { dados, gastoManual, entradaManual, carregando, temContas, temRenda, temDividas } =
    useFinanceiro();
  const [editandoGasto, setEditandoGasto] = useState(false);
  const [editandoEntrada, setEditandoEntrada] = useState(false);

  if (carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  if (!temContas && !temRenda) {
    return (
      <Ativacao
        nuncaSincronizou={ultimaEm === null}
        sincronizando={situacao === 'sincronizando'}
        onSincronizar={() => void sincronizarAgora(true)}
      />
    );
  }

  const limites = limitesDo(plano);
  const agora = Date.now();
  const meses = Math.max(HORIZONTE, mesesAteAMetaMaisLonga(dados.metas, agora));
  const visao = panorama(dados, { meses, agora, gastoManual, entradaManual });
  const { carteira, estimativa, estimativaEntrada, linhas, mesMaisApertado } = visao;
  const temBase = temBaseDeEntrada(estimativaEntrada);
  const mesAtual = chaveDoMes(agora);
  const mesCorrente = resumoDoMes(dados, mesAtual, agora);

  const daParaTransferir = dados.contas
    .filter(podeEnviar)
    .some((e) => dados.contas.filter(podeReceber).some((r) => r.id !== e.id));

  // As parcelas que voce mesmo paga, no mes corrente. Desconto em folha fica de
  // fora: ele nao atrasa e nao pede registro, entao lembrar dele seria ruido.
  const parcelasDoMes = carteira.compromissos
    .filter((c) => c.origem === 'divida')
    .flatMap((compromisso) => {
      const divida = dados.dividas.find((d) => d.id === compromisso.id);
      if (!divida || divida.descontoEmFolha) return [];
      return compromisso.ciclos
        .filter((ciclo) => ciclo.competencia === mesAtual && ciclo.restante > 0)
        .map((ciclo) => ({ compromisso, ciclo }));
    });

  const faturasEmAberto = carteira.compromissos
    .filter((c) => c.origem === 'cartao')
    .flatMap((c) =>
      c.ciclos
        .filter((ciclo) => ciclo.restante > 0)
        .map((ciclo) => ({ compromisso: c, ciclo })),
    )
    .sort((a, b) => a.ciclo.competencia.localeCompare(b.ciclo.competencia));

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/')}>
            ‹
          </button>
          <h1>Carteira</h1>
          <button
            type="button"
            className="botao-icone"
            aria-label="Simular uma compra"
            onClick={() => navegar('/simular')}
          >
            ？
          </button>
        </div>
      </header>

      <section className="cartao">
        <span className="campo-rotulo">Saldo em conta</span>
        <div className="total-grande">{formatarReais(carteira.saldoEmConta)}</div>

        {/*
          O QUE VENCE NESTE MES VEM PRIMEIRO, e o total depois.
          `aPagar` e a soma de TODA parcela futura, de todos os meses. Com um
          financiamento longo ele produzia "R$ 1.500 em conta · R$ 42.000 a pagar
          · sobram -R$ 40.500": verdadeiro, alarmante e inacionavel, porque
          ninguem precisa pagar 42 mil hoje. O numero que muda decisao esta
          embaixo.
        */}
        {mesCorrente.aVencer > 0 && (
          <p className="dica">
            <strong>{formatarReais(mesCorrente.aVencer)}</strong> vencem ainda este mês — é o que
            precisa sair da conta agora.
          </p>
        )}

        {carteira.aPagar > 0 && (
          <p className={'dica ' + (carteira.sobraProjetada < 0 ? 'valor-ruim' : '')}>
            {formatarReais(carteira.aPagar)} a pagar no total
            {carteira.terminaEm && `, até ${nomeMes(carteira.terminaEm)}`} · se pagar tudo que
            deve, ficam {formatarReais(carteira.sobraProjetada)}
          </p>
        )}

        {/*
          A ponte para o Resumo. Sem ela a tela ia de "saldo hoje" direto para
          "proximos meses", pulando "como este mes esta indo" — e as duas telas
          pareciam desconexas, cada uma com um numero chamado sobra.
        */}
        {temRenda && (
          <button
            type="button"
            className="fatia-abrir dica"
            onClick={() => navegar('/resumo')}
          >
            Este mês: entraram {formatarReais(mesCorrente.entradas)}, saíram{' '}
            {formatarReais(
              mesCorrente.saidasAVista +
                mesCorrente.pagamentos +
                mesCorrente.descontoEmFolha +
                mesCorrente.enviadoAoVale,
            )}
            , sobra até agora{' '}
            <strong className={mesCorrente.sobra < 0 ? 'valor-ruim' : 'valor-bom'}>
              {formatarReais(mesCorrente.sobra)}
            </strong>{' '}
            ›
          </button>
        )}
        {carteira.saldoEmVales > 0 && (
          <p className="dica">{formatarReais(carteira.saldoEmVales)} em vale</p>
        )}
        {carteira.semConta.quantidade > 0 && (
          <p className="aviso aviso-atencao" style={{ marginTop: 10 }}>
            {carteira.semConta.quantidade} compra(s) sem conta definida, somando{' '}
            {formatarReais(carteira.semConta.total)}. Elas ficam fora do saldo até você dizer de
            onde saíram.
          </p>
        )}
        {carteira.rendasSemConta.quantidade > 0 && (
          <p className="aviso aviso-atencao" style={{ marginTop: 10 }}>
            {carteira.rendasSemConta.quantidade} entrada(s) sem conta definida, somando{' '}
            {formatarReais(carteira.rendasSemConta.total)}. Elas ficam fora do saldo até você
            dizer onde caíram.{' '}
            <button type="button" className="link" onClick={() => navegar('/receitas')}>
              Corrigir
            </button>
          </p>
        )}
      </section>

      <button
        type="button"
        className="botao botao-primario botao-largo"
        onClick={() => navegar('/simular')}
      >
        Posso comprar isto?
      </button>

      {carteira.contas.length > 0 && (
        <>
          <h2 className="secao-titulo">Onde está o dinheiro</h2>
          <div className="cartao">
            {carteira.contas.map((saldo) => (
              <div className="fatia-linha" key={saldo.conta.id}>
                <span>{saldo.conta.apelido}</span>
                <span className={saldo.saldo < 0 ? 'subiu' : ''}>{formatarReais(saldo.saldo)}</span>
              </div>
            ))}
            {/* Fica junto dos saldos porque e exatamente o numero que ele muda. */}
            {daParaTransferir && (
              <div className="acoes">
                <button
                  type="button"
                  className="botao botao-largo"
                  onClick={() => navegar('/transferencias')}
                >
                  Transferir entre contas
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {parcelasDoMes.length > 0 && (
        <>
          <h2 className="secao-titulo">Parcelas a pagar</h2>
          <ul className="lista">
            {parcelasDoMes.map(({ compromisso, ciclo }) => (
              <li key={compromisso.id + ciclo.competencia}>
                <button
                  type="button"
                  className="compra"
                  onClick={() => navegar(`/parcela/${compromisso.id}/${ciclo.competencia}`)}
                >
                  <div className="compra-corpo">
                    <div className="compra-titulo">{compromisso.descricao}</div>
                    <div className="compra-meta">
                      {nomeMes(ciclo.competencia)} · vence em {formatarData(ciclo.vencimentoEm)}
                      {ciclo.pago > 0 && ` · pago ${formatarReais(ciclo.pago)}`}
                    </div>
                  </div>
                  <span className="compra-valor">{formatarReais(ciclo.restante)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {faturasEmAberto.length > 0 && (
        <>
          <h2 className="secao-titulo">Faturas a pagar</h2>
          <ul className="lista">
            {faturasEmAberto.map(({ compromisso, ciclo }) => (
              <li key={compromisso.id + ciclo.competencia}>
                <button
                  type="button"
                  className="compra"
                  onClick={() => navegar(`/fatura/${compromisso.id}/${ciclo.competencia}`)}
                >
                  <div className="compra-corpo">
                    <div className="compra-titulo">{compromisso.descricao}</div>
                    <div className="compra-meta">
                      {nomeMes(ciclo.competencia)}{' '}
                      <Situacao
                        situacao={
                          ciclo.competencia > mesAtual
                            ? 'aberta'
                            : ciclo.pago > 0
                              ? 'aberta'
                              : 'fechada'
                        }
                      />
                      {ciclo.pago > 0 && ` · pago ${formatarReais(ciclo.pago)}`}
                    </div>
                  </div>
                  <span className="compra-valor">{formatarReais(ciclo.restante)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {temDividas && (
        <>
          <h2 className="secao-titulo">Empréstimos</h2>
          <div className="cartao">
            {carteira.compromissos
              .filter((c) => c.origem === 'divida')
              .map((c) => (
                <div className="fatia-linha" key={c.id}>
                  <span>
                    {c.descricao}
                    {c.falta.ultima && (
                      <span className="dica"> · até {nomeMes(c.falta.ultima)}</span>
                    )}
                  </span>
                  <span>{formatarReais(c.falta.restante)}</span>
                </div>
              ))}
          </div>
        </>
      )}

      <h2 className="secao-titulo">Próximos meses</h2>

      {!temBase && (
        <p className="dica">
          Para projetar os próximos meses o app precisa saber quanto costuma entrar: lance as
          entradas de alguns meses, ou informe o valor logo abaixo.{' '}
          <button type="button" className="link" onClick={() => navegar('/receitas')}>
            Lançar uma entrada
          </button>
        </p>
      )}

      {temBase && (
        <TabelaPrevisao
          linhas={linhas}
          visiveis={limites.mesesDePrevisao}
          maisApertado={mesMaisApertado}
        />
      )}

      {/*
        A ENTRADA E ESTIMADA, nao cadastrada: ninguem registra "salario, todo dia
        5". O que vai entrar nos meses que vem e a media dos meses completos
        anteriores, como o gasto corrente. Fica aqui, ao lado da outra premissa,
        e esta SEMPRE visivel: com o campo manual a previsao liga no primeiro dia,
        sem esperar tres meses de historico.
      */}
      <div className="cartao">
        <div className="fatia-linha">
          <span>Entrada estimada</span>
          <span>{formatarReais(estimativaEntrada.total)}/mês</span>
        </div>
        <p className="dica" style={{ marginTop: 6 }}>
          {estimativaEntrada.manual
            ? 'Valor que você informou.'
            : estimativaEntrada.mesesUsados === 0
              ? 'Ainda sem entrada lançada nos últimos três meses completos.'
              : estimativaEntrada.fraca
                ? `Estimativa fraca: só ${estimativaEntrada.mesesUsados} mês com entrada.`
                : `Média de ${estimativaEntrada.mesesUsados} meses completos, só do que caiu em conta.`}{' '}
          Extras como o 13º e reembolsos entram na média; se um mês fugiu do comum, informe o
          valor que você costuma receber.
        </p>

        {editandoEntrada ? (
          <div className="campo">
            <label className="campo-rotulo" htmlFor="entrada">Usar este valor</label>
            <CampoDinheiro
              id="entrada"
              valor={entradaManual ?? estimativaEntrada.total}
              onChange={(centavos) => void gravarEntradaManual(centavos)}
            />
            <div className="acoes" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="botao"
                onClick={() => {
                  void gravarEntradaManual(null);
                  setEditandoEntrada(false);
                }}
              >
                Voltar à média
              </button>
              <button
                type="button"
                className="botao botao-primario"
                onClick={() => setEditandoEntrada(false)}
              >
                Pronto
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="botao botao-largo" onClick={() => setEditandoEntrada(true)}>
            Informar quanto costuma entrar
          </button>
        )}
      </div>

      {temBase && (
        <div className="cartao">
          <div className="fatia-linha">
            <span>Gasto corrente estimado</span>
            <span>{formatarReais(estimativa.total)}/mês</span>
          </div>
          <p className="dica" style={{ marginTop: 6 }}>
            {estimativa.manual
              ? 'Valor que você informou.'
              : estimativa.fraca
                ? `Estimativa fraca: só ${estimativa.mesesUsados} mês(es) de histórico.`
                : `Média de ${estimativa.mesesUsados} meses completos — fixos ${formatarReais(estimativa.fixo)} + variáveis ${formatarReais(estimativa.variavel)}.`}{' '}
            Categorias eventuais (uma geladeira, uma cirurgia) ficam de fora, senão uma compra
            única viraria previsão para sempre.
          </p>

          {editandoGasto ? (
            <div className="campo">
              <label className="campo-rotulo" htmlFor="gasto">Usar este valor</label>
              <CampoDinheiro
                id="gasto"
                valor={gastoManual ?? estimativa.total}
                onChange={(centavos) => void gravarGastoManual(centavos)}
              />
              <div className="acoes" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="botao"
                  onClick={() => {
                    void gravarGastoManual(null);
                    setEditandoGasto(false);
                  }}
                >
                  Voltar à média
                </button>
                <button
                  type="button"
                  className="botao botao-primario"
                  onClick={() => setEditandoGasto(false)}
                >
                  Pronto
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="botao botao-largo" onClick={() => setEditandoGasto(true)}>
              Ajustar a estimativa
            </button>
          )}
        </div>
      )}

      <h2 className="secao-titulo">Cadastros</h2>
      <div className="cartao">
        <div className="acoes" style={{ marginTop: 0 }}>
          <button type="button" className="botao botao-largo" onClick={() => navegar('/contas')}>
            Contas e cartões{temContas ? ` (${dados.contas.length})` : ''}
          </button>
          <button type="button" className="botao botao-largo" onClick={() => navegar('/receitas')}>
            Receitas{temRenda ? ` (${dados.rendas.length})` : ''}
          </button>
          <button type="button" className="botao botao-largo" onClick={() => navegar('/dividas')}>
            Empréstimos{temDividas ? ` (${dados.dividas.length})` : ''}
          </button>
          <button type="button" className="botao botao-largo" onClick={() => navegar('/metas')}>
            Metas{dados.metas.length > 0 ? ` (${dados.metas.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A porta de entrada do controle financeiro, quando ainda nao ha nada dentro.
 *
 * Existe porque a versao anterior escondia o modulo inteiro ate a primeira conta
 * existir — inclusive o caminho para criar essa primeira conta.
 *
 * Os dois estados sao separados de proposito. Num aparelho novo, "nao ha conta"
 * e "a conta ainda nao chegou da nuvem" parecem identicos daqui, e convidar a
 * cadastrar produziria um segundo "Nubank" que a sincronizacao duplicaria nos
 * dois aparelhos com toda a fidelidade. O aviso aparece, mas nao tranca nada:
 * quem esta comecando de verdade tambem nunca sincronizou, e travar os botoes
 * recriaria o beco sem saida que esta tela veio desfazer.
 */
function Ativacao({
  nuncaSincronizou,
  sincronizando,
  onSincronizar,
}: {
  nuncaSincronizou: boolean;
  sincronizando: boolean;
  onSincronizar: () => void;
}) {
  const navegar = useNavigate();

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/')}>
            ‹
          </button>
          <h1>Controle financeiro</h1>
        </div>
      </header>

      <div className="cartao">
        <p style={{ marginTop: 0 }}>
          Contas, cartões, faturas e a previsão dos próximos meses — para o app responder
          <strong> “posso comprar isto?”</strong> antes da compra.
        </p>
        <p className="dica">
          Ligar isto não muda em nada o registro de compras: ele continua exatamente como é.
        </p>
      </div>

      {nuncaSincronizou && (
        <div className="cartao">
          <p className="aviso aviso-atencao" style={{ margin: 0 }}>
            Este aparelho ainda não recebeu os dados da nuvem. Se você já cadastrou contas em
            outro aparelho, <strong>sincronize antes de cadastrar</strong> — senão a mesma conta
            passa a existir duas vezes.
          </p>
          <div className="acoes">
            <button
              type="button"
              className="botao botao-primario botao-largo"
              disabled={sincronizando}
              onClick={onSincronizar}
            >
              {sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>
          </div>
        </div>
      )}

      <div className="cartao">
        <div className="acoes" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="botao botao-primario botao-largo"
            onClick={() => navegar('/contas')}
          >
            Cadastrar conta ou cartão
          </button>
          <button type="button" className="botao botao-largo" onClick={() => navegar('/receitas')}>
            Cadastrar uma entrada
          </button>
        </div>
        <p className="dica">
          Comece pela conta de onde o dinheiro sai. As entradas que você lança são o que faz o
          app projetar os próximos meses.
        </p>
      </div>
    </div>
  );
}
