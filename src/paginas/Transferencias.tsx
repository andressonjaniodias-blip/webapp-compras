/**
 * Dinheiro mudando de bolso entre as suas proprias contas.
 *
 * A conta ja estava certa desde a v2 — `saldoDaConta` tira da origem e poe no
 * destino, e o `resumoDoMes` ignora este registro de proposito — mas nao havia
 * tela: o unico lugar do app que criava uma transferencia era o pagamento de
 * fatura. Dava para descrever a regra e nao dava para usa-la.
 *
 * A tela existe tanto para CRIAR quanto para VER e DESFAZER. Sem a lista, um
 * saque digitado errado ficaria para sempre no saldo, sem nenhum lugar onde
 * apaga-lo — que e exatamente o que acontecia ate aqui.
 *
 * Quem pode enviar e quem pode receber esta em `compartilhado/tipos.ts`, junto
 * das outras regras de conta. Aqui so se pergunta.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { acharConta } from '../../compartilhado/carteira';
import {
  motivoParaNaoTransferir,
  podeEnviar,
  podeReceber,
} from '../../compartilhado/tipos';
import { excluirTransferencia, registrarTransferencia } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { deInputDataHora, formatarData, paraInputDataHora } from '../lib/datas';
import { useApp } from '../estado';

export function Transferencias() {
  const navegar = useNavigate();
  const { atualizarPendentes } = useApp();
  const { dados, carregando } = useFinanceiro();

  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [quando, setQuando] = useState(() => Date.now());
  const [observacao, setObservacao] = useState('');

  if (carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  const enviam = dados.contas.filter(podeEnviar);
  const recebem = dados.contas.filter(podeReceber);
  const daParaTransferir = enviam.some((e) => recebem.some((r) => r.id !== e.id));

  const origem = enviam.find((c) => c.id === origemId) ?? enviam[0];
  const destinos = recebem.filter((c) => c.id !== origem?.id);
  const destino = destinos.find((c) => c.id === destinoId) ?? destinos[0];

  const motivo = motivoParaNaoTransferir(origem, destino, valor ?? 0);
  const jaFeitas = dados.transferencias.filter((t) => t.alvo === 'conta');

  async function transferir() {
    if (!origem || !destino || motivo !== null) return;
    await registrarTransferencia({
      origemContaId: origem.id,
      alvo: 'conta',
      alvoId: destino.id,
      valor: valor ?? 0,
      data: quando,
      observacao,
    });
    setValor(null);
    setObservacao('');
    setQuando(Date.now());
    await atualizarPendentes();
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/carteira')}>
            ‹
          </button>
          <h1>Transferências</h1>
        </div>
      </header>

      {!daParaTransferir ? (
        <div className="cartao">
          <p style={{ marginTop: 0 }}>
            Transferir precisa de duas contas: uma de onde o dinheiro sai e outra onde ele cai.
          </p>
          <div className="acoes" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="botao botao-primario botao-largo"
              onClick={() => navegar('/contas')}
            >
              Cadastrar conta ou cartão
            </button>
          </div>
        </div>
      ) : (
        <div className="cartao">
          <div className="campo">
            <label className="campo-rotulo" htmlFor="origem">Sai de</label>
            <select
              id="origem"
              className="entrada"
              value={origem?.id ?? ''}
              onChange={(e) => setOrigemId(e.target.value)}
            >
              {enviam.map((c) => (
                <option key={c.id} value={c.id}>{c.apelido || 'Conta'}</option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="destino">Vai para</label>
            <select
              id="destino"
              className="entrada"
              value={destino?.id ?? ''}
              onChange={(e) => setDestinoId(e.target.value)}
            >
              {destinos.map((c) => (
                <option key={c.id} value={c.id}>{c.apelido || 'Conta'}</option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="valor">Valor</label>
            <CampoDinheiro id="valor" valor={valor ?? 0} onChange={setValor} />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="quando">Quando</label>
            <input
              id="quando"
              className="entrada"
              type="datetime-local"
              value={paraInputDataHora(quando)}
              onChange={(e) => {
                const data = deInputDataHora(e.target.value);
                if (data !== null) setQuando(data);
              }}
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="obs">Observação (opcional)</label>
            <input
              id="obs"
              className="entrada"
              type="text"
              autoComplete="off"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          {motivo !== null && valor !== null && (
            <p className="aviso aviso-atencao">{motivo}</p>
          )}

          <button
            type="button"
            className="botao botao-primario botao-largo"
            disabled={motivo !== null}
            onClick={() => void transferir()}
          >
            Registrar transferência
          </button>

          <p className="dica">
            Isto <strong>não é gasto e não é entrada</strong>: o dinheiro só muda de bolso, e o
            total que você tem continua o mesmo. Recarga de vale pelo empregador não entra aqui
            — ela é uma <strong>entrada</strong> apontando para o vale.
          </p>
        </div>
      )}

      {jaFeitas.length > 0 && (
        <>
          <h2 className="secao-titulo">Já transferidas</h2>
          <ul className="lista">
            {jaFeitas.map((t) => (
              <li key={t.id}>
                <div className="item-linha">
                  <div className="item-corpo">
                    <div className="item-nome">
                      {acharConta(dados.contas, t.origemContaId)?.apelido ?? 'conta'} →{' '}
                      {acharConta(dados.contas, t.alvoId)?.apelido ?? 'conta'}
                    </div>
                    <div className="item-meta">
                      {formatarData(t.data)}
                      {t.observacao && ` · ${t.observacao}`}
                    </div>
                  </div>
                  <span className="item-valor">{formatarReais(t.valor)}</span>
                  <button
                    type="button"
                    className="botao-icone"
                    aria-label="Desfazer transferência"
                    onClick={async () => {
                      if (!window.confirm('Desfazer esta transferência? Os dois saldos voltam ao que eram.')) return;
                      await excluirTransferencia(t.id);
                      await atualizarPendentes();
                    }}
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
