/**
 * Uma fatura: as parcelas que vencem naquele mes, e o pagamento dela.
 *
 * A fatura NAO e uma tabela: ela e derivada do dia de fechamento do cartao e das
 * parcelas do ciclo. Uma tabela precisaria ser reconciliada a cada edicao
 * retroativa de compra — mudar a data de uma compra de tres meses atras
 * obrigaria a recalcular faturas ja fechadas.
 *
 * O que E gravado e o PAGAMENTO, e e ele que impede a contagem dupla: como
 * aponta para este cartao e esta competencia, o app sabe que aquele dinheiro ja
 * foi contado como gasto quando a compra foi lançada. Sem esse vinculo, pagar a
 * fatura seria indistinguivel de gastar de novo.
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import {
  acharConta,
  faturasDoCartao,
  pagamentosDe,
  type SituacaoFatura,
} from '../../compartilhado/carteira';
import { intervaloDoCiclo } from '../../compartilhado/fatura';
import { excluirTransferencia, registrarTransferencia } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { formatarData, nomeMes } from '../lib/datas';
import { useApp } from '../estado';

export function Fatura() {
  const { contaId = '', competencia = '' } = useParams();
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

  const conta = acharConta(dados.contas, contaId);
  if (!conta || conta.tipo !== 'credito') {
    return (
      <div className="app">
        <p className="vazio">Cartão não encontrado.</p>
      </div>
    );
  }

  const agora = Date.now();
  const fatura = faturasDoCartao(conta, dados, agora).find((f) => f.competencia === competencia);
  const ciclo = intervaloDoCiclo(conta, competencia);
  const pagamentos = pagamentosDe(dados.transferencias, 'cartao', conta.id).filter(
    (p) => p.competencia === competencia,
  );
  const contasDeOrigem = dados.contas.filter((c) => c.tipo === 'corrente' || c.tipo === 'dinheiro');
  const restante = fatura?.restante ?? 0;

  async function pagar() {
    const contaOrigem = origem || contasDeOrigem[0]?.id;
    if (!contaOrigem) return;
    await registrarTransferencia({
      origemContaId: contaOrigem,
      alvo: 'cartao',
      alvoId: contaId,
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
          <h1>{conta.apelido}</h1>
        </div>
      </header>

      <section className="cartao">
        <span className="campo-rotulo">
          Fatura de {nomeMes(competencia)} <Situacao situacao={fatura?.situacao ?? 'aberta'} />
        </span>
        <div className="total-grande">{formatarReais(fatura?.total ?? 0)}</div>
        <p className="dica">
          compras de {formatarData(ciclo.inicio)} a {formatarData(ciclo.fim)} · vence em{' '}
          {formatarData(fatura?.vencimentoEm ?? ciclo.fim)}
        </p>
        {fatura && fatura.pago > 0 && (
          <p className="dica">
            pago {formatarReais(fatura.pago)}
            {restante > 0 && ` · faltam ${formatarReais(restante)}`}
          </p>
        )}
      </section>

      <h2 className="secao-titulo">O que compõe esta fatura</h2>

      {(fatura?.parcelas.length ?? 0) === 0 && (
        <p className="vazio">Nenhuma compra cai nesta fatura.</p>
      )}

      <ul className="lista">
        {(fatura?.parcelas ?? [])
          .slice()
          .sort((a, b) => a.descricao.localeCompare(b.descricao))
          .map((parcela) => (
            <li key={parcela.fonteId + '-' + parcela.indice}>
              <button
                type="button"
                className="item-linha"
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit', color: 'inherit' }}
                onClick={() => navegar('/compra/' + parcela.fonteId)}
              >
                <div className="item-corpo">
                  <div className="item-nome">{parcela.descricao}</div>
                  <div className="item-meta">
                    {parcela.de > 1 ? `parcela ${parcela.indice}/${parcela.de}` : 'à vista'}
                  </div>
                </div>
                <span className="item-valor">{formatarReais(parcela.valor)}</span>
              </button>
            </li>
          ))}
      </ul>

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
              value={origem || contasDeOrigem[0]!.id}
              onChange={(e) => setOrigem(e.target.value)}
            >
              {contasDeOrigem.map((c) => (
                <option key={c.id} value={c.id}>{c.apelido}</option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="valorPago">Valor</label>
            <CampoDinheiro id="valorPago" valor={valor ?? restante} onChange={setValor} />
            <p className="dica">
              Pagar menos que o total é permitido: o resto continua devendo nesta fatura, e
              não vira desconto na próxima.
            </p>
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
            o gasto já foi contado quando a compra foi lançada.
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

export function Situacao({ situacao }: { situacao: SituacaoFatura }) {
  const rotulo = { aberta: 'aberta', fechada: 'fechada', paga: 'paga' }[situacao];
  return <span className={'selo selo-' + situacao}>{rotulo}</span>;
}
