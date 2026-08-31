/**
 * A Carteira: quanto tem, quanto falta e como ficam os proximos meses.
 *
 * Ela so existe quando ha conta ou renda cadastrada — Princípio 0: quem so quer
 * anotar compras nunca chega aqui, e nao ve nem o icone que leva ate aqui.
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
import { mesesAteAMetaMaisLonga, panorama } from '../../compartilhado/previsao';
import { chaveDoMes } from '../../compartilhado/fatura';
import { gravarGastoManual } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { nomeMes } from '../lib/datas';
import { useApp } from '../estado';
import { Situacao } from './Fatura';

/** O horizonte calculado e sempre este; o plano decide quanto dele e LIDO. */
const HORIZONTE = 12;

export function Carteira() {
  const navegar = useNavigate();
  const { plano } = useApp();
  const { dados, gastoManual, carregando, temContas, temRenda, temDividas } = useFinanceiro();
  const [editandoGasto, setEditandoGasto] = useState(false);

  if (carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  const limites = limitesDo(plano);
  const agora = Date.now();
  const meses = Math.max(HORIZONTE, mesesAteAMetaMaisLonga(dados.metas, agora));
  const visao = panorama(dados, { meses, agora, gastoManual });
  const { carteira, estimativa, linhas, mesMaisApertado } = visao;
  const mesAtual = chaveDoMes(agora);

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
        {carteira.aPagar > 0 && (
          <p className={'dica ' + (carteira.sobraProjetada < 0 ? 'subiu' : '')}>
            {formatarReais(carteira.aPagar)} a pagar · sobram{' '}
            {formatarReais(carteira.sobraProjetada)}
            {carteira.terminaEm && ` · último compromisso em ${nomeMes(carteira.terminaEm)}`}
          </p>
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
          </div>
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

      {!temRenda ? (
        <p className="dica">
          Cadastre uma entrada para o app poder projetar os próximos meses.{' '}
          <button type="button" className="link" onClick={() => navegar('/rendas')}>
            Cadastrar entrada
          </button>
        </p>
      ) : (
        <>
          <TabelaPrevisao
            linhas={linhas}
            visiveis={limites.mesesDePrevisao}
            maisApertado={mesMaisApertado}
          />

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
        </>
      )}

      <h2 className="secao-titulo">Cadastros</h2>
      <div className="cartao">
        <div className="acoes" style={{ marginTop: 0 }}>
          <button type="button" className="botao botao-largo" onClick={() => navegar('/contas')}>
            Contas e cartões{temContas ? ` (${dados.contas.length})` : ''}
          </button>
          <button type="button" className="botao botao-largo" onClick={() => navegar('/rendas')}>
            Entradas{temRenda ? ` (${dados.rendas.length})` : ''}
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
