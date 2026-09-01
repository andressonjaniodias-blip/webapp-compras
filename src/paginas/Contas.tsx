/**
 * Contas e cartoes: onde o dinheiro esta, ou de onde ele sai.
 *
 * O apelido e texto livre de proposito, sem mascara e sem formato: e o usuario
 * quem sabe como reconhece o proprio cartao — "Nubank roxinho", "Caixa 4417",
 * "o da carteira". Restringir o campo so criaria um jeito errado de escrever o
 * que ja estava certo na cabeça de quem digita.
 *
 * Fechamento e vencimento so aparecem no credito. Saldo inicial so aparece onde
 * ele significa alguma coisa — cartao de credito nao tem saldo, tem fatura.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { CampoNumero } from '../componentes/CampoNumero';
import { TIPOS_CONTA } from '../../compartilhado/constantes';
import { calcularCarteira } from '../../compartilhado/carteira';
import { temSaldo, type Conta, type TipoConta } from '../../compartilhado/tipos';
import {
  atualizarConta,
  criarConta,
  excluirConta,
  listarContas,
  reinformarSaldo,
} from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { deInputData, formatarData, paraInputData } from '../lib/datas';
import { useApp } from '../estado';

export function Contas() {
  const navegar = useNavigate();
  const { atualizarPendentes } = useApp();
  const { dados } = useFinanceiro();
  const contas = useLiveQuery(listarContas, [], undefined);
  const [editando, setEditando] = useState<string | null>(null);

  const carteira = calcularCarteira(dados, Date.now());
  const saldoDe = new Map(carteira.contas.map((s) => [s.conta.id, s.saldo]));

  async function nova() {
    const id = await criarConta({ apelido: '' });
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
          <h1>Contas e cartões</h1>
        </div>
      </header>

      {contas === undefined && <p className="carregando">Carregando…</p>}

      {contas !== undefined && contas.length === 0 && (
        <p className="vazio">
          Nenhuma conta ainda.
          <br />
          Cadastre onde seu dinheiro fica para o app saber de onde cada compra sai.
        </p>
      )}

      <ul className="lista">
        {(contas ?? []).map((conta) =>
          editando === conta.id ? (
            <li key={conta.id}>
              <FormConta
                conta={conta}
                onPronto={async () => {
                  await atualizarPendentes();
                  setEditando(null);
                }}
                onExcluir={async () => {
                  await excluirConta(conta.id);
                  await atualizarPendentes();
                  setEditando(null);
                }}
              />
            </li>
          ) : (
            <li key={conta.id}>
              <button type="button" className="compra" onClick={() => setEditando(conta.id)}>
                <div className="compra-corpo">
                  <div className="compra-titulo">{conta.apelido || '(sem apelido)'}</div>
                  <div className="compra-meta">
                    {rotuloDoTipo(conta.tipo)}
                    {conta.tipo === 'credito' &&
                      ` · fecha dia ${conta.diaFechamento} · vence dia ${conta.diaVencimento}`}
                    {conta.tipo === 'credito' && conta.limite > 0 &&
                      ` · limite ${formatarReais(conta.limite)}`}
                  </div>
                </div>
                {temSaldo(conta) && (
                  <span className="compra-valor">{formatarReais(saldoDe.get(conta.id) ?? 0)}</span>
                )}
              </button>
            </li>
          ),
        )}
      </ul>

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={nova}>
          Nova conta
        </button>
      </div>
    </div>
  );
}

function rotuloDoTipo(tipo: TipoConta): string {
  return TIPOS_CONTA.find((t) => t.valor === tipo)?.rotulo ?? tipo;
}

function FormConta({
  conta,
  onPronto,
  onExcluir,
}: {
  conta: Conta;
  onPronto: () => Promise<void>;
  onExcluir: () => Promise<void>;
}) {
  const [saldoNovo, setSaldoNovo] = useState<number | null>(null);
  const [dataNova, setDataNova] = useState<number | null>(null);

  const saldoEmEdicao = saldoNovo ?? conta.saldoInicial;
  const dataEmEdicao = dataNova ?? conta.saldoInicialEm;
  const mudouOSaldo =
    saldoEmEdicao !== conta.saldoInicial || dataEmEdicao !== conta.saldoInicialEm;

  async function mudar(mudancas: Partial<Omit<Conta, 'id'>>) {
    await atualizarConta(conta.id, mudancas);
  }

  return (
    <div className="form-item">
      <div className="campo">
        <label className="campo-rotulo" htmlFor={'apelido-' + conta.id}>
          Como você chama esta conta
        </label>
        <input
          id={'apelido-' + conta.id}
          className="entrada"
          type="text"
          autoComplete="off"
          placeholder="Nubank roxinho, Caixa, o da carteira…"
          value={conta.apelido}
          onChange={(e) => void mudar({ apelido: e.target.value })}
        />
        <p className="dica">Escreva do jeito que preferir. Qualquer caractere serve.</p>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'tipo-' + conta.id}>Tipo</label>
        <select
          id={'tipo-' + conta.id}
          className="entrada"
          value={conta.tipo}
          onChange={(e) => void mudar({ tipo: e.target.value as TipoConta })}
        >
          {TIPOS_CONTA.map((tipo) => (
            <option key={tipo.valor} value={tipo.valor}>{tipo.rotulo}</option>
          ))}
        </select>
      </div>

      {conta.tipo === 'credito' && (
        <>
          <div className="grade-item-4">
            <div>
              <label className="mini-rotulo" htmlFor={'fech-' + conta.id}>Fecha no dia</label>
              <CampoNumero
                id={'fech-' + conta.id}
                valor={conta.diaFechamento}
                min={1}
                max={31}
                onChange={(diaFechamento) => void mudar({ diaFechamento })}
              />
            </div>
            <div>
              <label className="mini-rotulo" htmlFor={'venc-' + conta.id}>Vence no dia</label>
              <CampoNumero
                id={'venc-' + conta.id}
                valor={conta.diaVencimento}
                min={1}
                max={31}
                onChange={(diaVencimento) => void mudar({ diaVencimento })}
              />
            </div>
          </div>
          <p className="dica">
            Compra até o dia {conta.diaFechamento} entra na fatura que vence no dia{' '}
            {conta.diaVencimento}. Depois disso, cai na próxima — e você ganha quase um mês
            a mais de prazo.
          </p>

          <div className="campo">
            <label className="campo-rotulo" htmlFor={'limite-' + conta.id}>Limite (opcional)</label>
            <CampoDinheiro
              id={'limite-' + conta.id}
              valor={conta.limite}
              onChange={(limite) => void mudar({ limite })}
            />
          </div>
        </>
      )}

      {temSaldo(conta) && (
        <div className="campo">
          <label className="campo-rotulo" htmlFor={'saldo-' + conta.id}>
            Saldo de partida
          </label>
          <CampoDinheiro
            id={'saldo-' + conta.id}
            valor={saldoEmEdicao}
            onChange={setSaldoNovo}
          />

          <label className="campo-rotulo" htmlFor={'saldo-em-' + conta.id} style={{ marginTop: 10 }}>
            Válido a partir de
          </label>
          <input
            id={'saldo-em-' + conta.id}
            className="entrada"
            type="date"
            value={paraInputData(dataEmEdicao)}
            onChange={(e) => {
              const data = deInputData(e.target.value);
              if (data !== null) setDataNova(data);
            }}
          />
          <p className="dica">
            Tudo que você registrar <strong>a partir dessa data</strong> soma neste saldo. O que
            é anterior não soma — o valor informado já contém. Mexer no valor não muda a data:
            quem escolhe é você.
          </p>

          {mudouOSaldo && (
            <button
              type="button"
              className="botao botao-largo"
              onClick={async () => {
                await reinformarSaldo(conta.id, saldoEmEdicao, dataEmEdicao);
                setSaldoNovo(null);
                setDataNova(null);
              }}
            >
              Usar {formatarReais(saldoEmEdicao)} desde {formatarData(dataEmEdicao)}
            </button>
          )}
        </div>
      )}

      <div className="form-item-rodape">
        <button
          type="button"
          className="botao botao-perigo"
          onClick={() => {
            if (window.confirm('Excluir esta conta? As compras dela ficam sem conta definida.')) {
              void onExcluir();
            }
          }}
        >
          Excluir
        </button>
        <button type="button" className="botao botao-primario" onClick={() => void onPronto()}>
          Pronto
        </button>
      </div>
    </div>
  );
}
