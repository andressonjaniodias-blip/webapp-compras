/**
 * Uma parcela de emprestimo ou financiamento, e o pagamento dela.
 *
 * Mesma forma da tela de fatura, e pelo mesmo motivo: o que e gravado nao e a
 * parcela — ela e derivada de valor, prazo e data de inicio — mas o PAGAMENTO.
 * E o pagamento que tira o dinheiro da conta, e o vinculo com `alvo: 'divida'` e
 * a competencia que impede o app de contar isso como gasto novo.
 *
 * Divida com desconto em folha nao chega aqui: ela e considerada paga na data do
 * salario e nao pede registro nenhum. Esta tela existe para a outra metade, a que
 * voce paga por conta e pode esquecer.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { acharConta, pagamentosDe, presumidoAteDaDivida } from '../../compartilhado/carteira';
import { parcelasDaDivida, porCompetencia } from '../../compartilhado/parcelamento';
import { podeEnviar } from '../../compartilhado/tipos';
import { excluirTransferencia, registrarTransferencia } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { formatarData, nomeMes } from '../lib/datas';
import { useApp } from '../estado';

export function Parcela() {
  const { dividaId = '', competencia = '' } = useParams();
  const navegar = useNavigate();
  const { atualizarPendentes } = useApp();
  const { dados, carregando } = useFinanceiro();

  const [valor, setValor] = useState<number | null>(null);
  const [origem, setOrigem] = useState('');

  if (carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  const divida = dados.dividas.find((d) => d.id === dividaId);
  if (!divida) {
    return (
      <div className="app">
        <p className="vazio">Empréstimo não encontrado.</p>
      </div>
    );
  }

  const agora = Date.now();
  const pagamentosDaDivida = pagamentosDe(dados.transferencias, 'divida', divida.id);
  const ciclo = porCompetencia(
    parcelasDaDivida(divida),
    pagamentosDaDivida,
    presumidoAteDaDivida(divida, dados, agora),
  ).find((c) => c.competencia === competencia);

  const pagamentos = pagamentosDaDivida.filter((p) => p.competencia === competencia);
  const contasDeOrigem = dados.contas.filter(podeEnviar);
  const restante = ciclo?.restante ?? 0;
  const padrao = contasDeOrigem.find((c) => c.id === divida.contaId) ?? contasDeOrigem[0];

  async function pagar() {
    const contaOrigem = origem || padrao?.id;
    if (!contaOrigem) return;
    await registrarTransferencia({
      origemContaId: contaOrigem,
      alvo: 'divida',
      alvoId: dividaId,
      competencia,
      valor: valor ?? restante,
      data: Date.now(),
    });
    setValor(null);
    await atualizarPendentes();
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/carteira')}>
            ‹
          </button>
          <h1>{divida.descricao || 'Empréstimo'}</h1>
        </div>
      </header>

      <section className="cartao">
        <span className="campo-rotulo">Parcela de {nomeMes(competencia)}</span>
        <div className="total-grande">{formatarReais(ciclo?.total ?? 0)}</div>
        {ciclo && (
          <p className="dica">
            {ciclo.parcelas[0]
              ? `parcela ${ciclo.parcelas[0].indice} de ${ciclo.parcelas[0].de} · vence em ${formatarData(ciclo.vencimentoEm)}`
              : `vence em ${formatarData(ciclo.vencimentoEm)}`}
          </p>
        )}
        {ciclo?.presumido && (
          <p className="dica">
            Considerada paga no vencimento, porque a competência já passou. Se não foi assim,
            registre o pagamento abaixo — o registro vale mais que a presunção.
          </p>
        )}
        {ciclo && ciclo.pago > 0 && (
          <p className="dica">
            pago {formatarReais(ciclo.pago)}
            {restante > 0 && ` · faltam ${formatarReais(restante)}`}
          </p>
        )}
      </section>

      <h2 className="secao-titulo">Pagamento</h2>

      {contasDeOrigem.length === 0 ? (
        <p className="dica">
          Cadastre uma conta corrente para registrar de onde o pagamento sai.
        </p>
      ) : (
        <div className="cartao">
          <div className="campo">
            <label className="campo-rotulo" htmlFor="origem">Sai de</label>
            <select
              id="origem"
              className="entrada"
              value={origem || (padrao?.id ?? '')}
              onChange={(e) => setOrigem(e.target.value)}
            >
              {contasDeOrigem.map((c) => (
                <option key={c.id} value={c.id}>{c.apelido || 'Conta'}</option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="valorPago">Valor</label>
            <CampoDinheiro id="valorPago" valor={valor ?? restante} onChange={setValor} />
          </div>

          <button
            type="button"
            className="botao botao-primario botao-largo"
            disabled={(valor ?? restante) <= 0}
            onClick={() => void pagar()}
          >
            Registrar pagamento
          </button>
          <p className="dica">
            Isto tira o dinheiro da conta escolhida e <strong>não</strong> conta como gasto novo —
            pagar dívida é mudar de bolso, não gastar de novo.
          </p>
        </div>
      )}

      {pagamentos.length > 0 && (
        <ul className="lista">
          {pagamentos.map((pagamento) => (
            <li key={pagamento.id}>
              <div className="item-linha">
                <div className="item-corpo">
                  <div className="item-nome">Pago em {formatarData(pagamento.data)}</div>
                  <div className="item-meta">
                    de {acharConta(dados.contas, pagamento.origemContaId)?.apelido ?? 'conta'}
                  </div>
                </div>
                <span className="item-valor">{formatarReais(pagamento.valor)}</span>
                <button
                  type="button"
                  className="botao-icone"
                  aria-label="Desfazer pagamento"
                  onClick={async () => {
                    await excluirTransferencia(pagamento.id);
                    await atualizarPendentes();
                  }}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
