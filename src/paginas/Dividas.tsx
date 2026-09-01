/**
 * Emprestimos e financiamentos.
 *
 * Pergunta o que voce tem em maos: VALOR DA PARCELA, quantas e quando começou.
 * O app nao calcula juros, nao amortiza e nao sabe de IOF — nem precisa: com
 * parcela vezes prazo ele ja sabe quanto sai por mes e ate quando, que e o que
 * pesa na pergunta "posso comprar isto?".
 *
 * O modelo continua guardando `valorTotal`, e a troca de pergunta traz um ganho
 * fino de graça: o total vira multiplo exato da parcela, entao `valorDaParcela`
 * devolve a parcela cheia e some o caso "a primeira absorve os centavos", que
 * podia nao bater com o contrato.
 *
 * Uma divida cadastrada hoje pode ter começado ha um ano. As parcelas ja
 * vencidas contam como pagas por presuncao — ver `presumidoAteDaDivida` em
 * `compartilhado/carteira.ts` —, senao a tela diria "faltam 24 de 24" para quem
 * ja pagou metade.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { CampoNumero } from '../componentes/CampoNumero';
import { TIPOS_DIVIDA } from '../../compartilhado/constantes';
import { compromissos } from '../../compartilhado/carteira';
import { valorDaParcela } from '../../compartilhado/parcelamento';
import { podeEnviar, type Divida } from '../../compartilhado/tipos';
import { atualizarDivida, criarDivida, excluirDivida } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { deInputDataHora, nomeMes, paraInputDataHora } from '../lib/datas';
import { useApp } from '../estado';

export function Dividas() {
  const navegar = useNavigate();
  const { atualizarPendentes } = useApp();
  const { dados, carregando } = useFinanceiro();
  const [editando, setEditando] = useState<string | null>(null);

  const agora = Date.now();
  const faltaPorId = new Map(
    compromissos(dados, agora)
      .filter((c) => c.origem === 'divida')
      .map((c) => [c.id, c.falta]),
  );

  async function nova() {
    const id = await criarDivida({ primeiraEm: Date.now() });
    await atualizarPendentes();
    setEditando(id);
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/carteira')}>
            ‹
          </button>
          <h1>Empréstimos</h1>
        </div>
      </header>

      {carregando && <p className="carregando">Carregando…</p>}

      {!carregando && dados.dividas.length === 0 && (
        <p className="vazio">
          Nada cadastrado.
          <br />
          Empréstimo ou financiamento entra aqui para pesar na previsão dos próximos meses.
        </p>
      )}

      <ul className="lista">
        {dados.dividas.map((divida) => {
          const conta = dados.contas.find((c) => c.id === divida.contaId);
          const falta = faltaPorId.get(divida.id);
          const pagas = divida.parcelas - (falta?.parcelasRestantes ?? divida.parcelas);
          const progresso =
            divida.valorTotal > 0 && falta
              ? ((divida.valorTotal - falta.restante) / divida.valorTotal) * 100
              : 0;

          if (editando === divida.id) {
            return (
              <li key={divida.id}>
                <FormDivida
                  divida={divida}
                  contas={dados.contas.filter(podeEnviar)}
                  onFechar={async () => {
                    await atualizarPendentes();
                    setEditando(null);
                  }}
                />
              </li>
            );
          }

          return (
            <li key={divida.id}>
              <button
                type="button"
                className="compra"
                style={{ display: 'block' }}
                onClick={() => setEditando(divida.id)}
              >
                <div className="compra-titulo">{divida.descricao || 'Sem descrição'}</div>
                <div className="compra-meta" style={{ marginBottom: 8 }}>
                  {falta
                    ? `faltam ${falta.parcelasRestantes} de ${divida.parcelas} · ${formatarReais(falta.restante)}`
                    : `${divida.parcelas} parcelas`}
                  {falta?.ultima && ` · até ${nomeMes(falta.ultima)}`}
                </div>
                <div className="barra">
                  <div className="barra-preenchida" style={{ width: progresso + '%' }} />
                </div>
                <div className="compra-meta" style={{ marginTop: 6 }}>
                  {pagas} de {divida.parcelas} pagas ·{' '}
                  {formatarReais(valorDaParcela(divida.valorTotal, divida.parcelas, 2))}/mês
                  {divida.descontoEmFolha
                    ? ' · desconto em folha'
                    : conta
                      ? ` · sai de ${conta.apelido}`
                      : ''}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={nova}>
          Novo empréstimo
        </button>
      </div>
    </div>
  );
}

function FormDivida({
  divida,
  contas,
  onFechar,
}: {
  divida: Divida;
  contas: readonly { id: string; apelido: string }[];
  onFechar: () => Promise<void>;
}) {
  async function mudar(mudancas: Partial<Omit<Divida, 'id'>>) {
    await atualizarDivida(divida.id, mudancas);
  }

  /*
   * A parcela e DERIVADA do total — guardar as duas no banco abriria a porta
   * para elas discordarem —, mas enquanto o formulario esta aberto ela vive em
   * estado local.
   *
   * Sem isso havia uma corrida real: digitar a parcela e mudar o prazo em
   * seguida recalculava o total a partir de uma parcela que ainda nao tinha
   * voltado do Dexie, e o valor digitado sumia. Ler do estado local e sincrono,
   * entao a ordem em que voce mexe nos dois campos deixa de importar.
   */
  const [parcelaEditada, setParcelaEditada] = useState<number | null>(null);
  const parcela =
    parcelaEditada ?? (divida.parcelas > 0 ? Math.round(divida.valorTotal / divida.parcelas) : 0);

  return (
    <div className="form-item">
      <div className="campo">
        <label className="campo-rotulo" htmlFor={'desc-' + divida.id}>O que é</label>
        <input
          id={'desc-' + divida.id}
          className="entrada"
          type="text"
          autoComplete="off"
          placeholder="Financiamento da moto, consignado…"
          value={divida.descricao}
          onChange={(e) => void mudar({ descricao: e.target.value })}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'tipo-' + divida.id}>Tipo</label>
        <select
          id={'tipo-' + divida.id}
          className="entrada"
          value={divida.tipo}
          onChange={(e) => void mudar({ tipo: e.target.value as Divida['tipo'] })}
        >
          {TIPOS_DIVIDA.map((t) => (
            <option key={t.valor} value={t.valor}>{t.rotulo}</option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'parc-' + divida.id}>Valor da parcela</label>
        <CampoDinheiro
          id={'parc-' + divida.id}
          valor={parcela}
          onChange={(valor) => {
            setParcelaEditada(valor);
            void mudar({ valorTotal: valor * divida.parcelas });
          }}
        />
        <p className="dica">
          O valor que sai por mês, com os juros já dentro. O app não calcula juros — com a
          parcela e o prazo ele já sabe quanto falta e até quando.
        </p>
      </div>

      <div className="grade-item-4">
        <div>
          <label className="mini-rotulo" htmlFor={'par-' + divida.id}>Parcelas</label>
          <CampoNumero
            id={'par-' + divida.id}
            valor={divida.parcelas}
            min={1}
            max={480}
            onChange={(parcelas) => void mudar({ parcelas, valorTotal: parcela * parcelas })}
          />
        </div>
        <div>
          <label className="mini-rotulo" htmlFor={'prim-' + divida.id}>Primeira parcela</label>
          <input
            id={'prim-' + divida.id}
            className="entrada"
            type="datetime-local"
            value={paraInputDataHora(divida.primeiraEm)}
            onChange={(e) => {
              const primeiraEm = deInputDataHora(e.target.value);
              if (primeiraEm !== null) void mudar({ primeiraEm });
            }}
          />
        </div>
      </div>

      {divida.valorTotal > 0 && (
        <p className="dica">
          {divida.parcelas}x de {formatarReais(parcela)} · total{' '}
          {formatarReais(divida.valorTotal)}. Parcelas já vencidas contam como pagas.
        </p>
      )}

      <label className="interruptor" style={{ marginTop: 12 }}>
        <input
          type="checkbox"
          checked={divida.descontoEmFolha}
          onChange={(e) => void mudar({ descontoEmFolha: e.target.checked })}
        />
        <span>Desconto automático em folha</span>
      </label>
      <p className="dica">
        Consignado não atrasa: a parcela é considerada paga na data em que o salário cai, e o
        app não pede para você registrar o pagamento. Sem isto, ele lembra você todo mês.
      </p>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'conta-' + divida.id}>Sai da conta</label>
        <select
          id={'conta-' + divida.id}
          className="entrada"
          value={divida.contaId ?? ''}
          onChange={(e) => void mudar({ contaId: e.target.value || null })}
        >
          <option value="">Não informado</option>
          {contas.map((conta) => (
            <option key={conta.id} value={conta.id}>{conta.apelido || 'Conta'}</option>
          ))}
        </select>
        <p className="dica">
          A entrada que você cadastrou é o salário <strong>antes</strong> do desconto do
          empréstimo. Sem dizer de qual conta a parcela sai, o saldo sobe esse valor todo mês.
        </p>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'obs-' + divida.id}>Observação</label>
        <textarea
          id={'obs-' + divida.id}
          className="entrada"
          value={divida.observacao}
          onChange={(e) => void mudar({ observacao: e.target.value })}
        />
      </div>

      <div className="form-item-rodape">
        <button
          type="button"
          className="botao botao-perigo"
          onClick={async () => {
            if (window.confirm('Excluir este empréstimo?')) {
              await excluirDivida(divida.id);
              await onFechar();
            }
          }}
        >
          Excluir
        </button>
        <button type="button" className="botao botao-primario" onClick={() => void onFechar()}>
          Pronto
        </button>
      </div>
    </div>
  );
}
