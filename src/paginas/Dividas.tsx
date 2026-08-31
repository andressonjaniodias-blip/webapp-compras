/**
 * Emprestimos e financiamentos.
 *
 * Comeca simples de proposito: valor total, quantas parcelas e quando começou. O
 * `valorTotal` e o TOTAL A PAGAR, com juros ja dentro — o app nao calcula juros,
 * nao amortiza e nao sabe de IOF. Para a pergunta que ele existe para responder
 * ("posso comprar isto?"), o que importa e quanto sai por mes e ate quando.
 *
 * A mesma matematica das parcelas de cartao vale aqui, entao "quanto falta" e a
 * mesma conta nos dois lugares.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { TIPOS_DIVIDA } from '../../compartilhado/constantes';
import { compromissos } from '../../compartilhado/carteira';
import { valorDaParcela } from '../../compartilhado/parcelamento';
import type { Divida } from '../../compartilhado/tipos';
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

function FormDivida({ divida, onFechar }: { divida: Divida; onFechar: () => Promise<void> }) {
  async function mudar(mudancas: Partial<Omit<Divida, 'id'>>) {
    await atualizarDivida(divida.id, mudancas);
  }

  const parcela = valorDaParcela(divida.valorTotal, divida.parcelas, 2);
  const primeira = valorDaParcela(divida.valorTotal, divida.parcelas, 1);

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
        <label className="campo-rotulo" htmlFor={'total-' + divida.id}>Total a pagar</label>
        <CampoDinheiro
          id={'total-' + divida.id}
          valor={divida.valorTotal}
          onChange={(valorTotal) => void mudar({ valorTotal })}
        />
        <p className="dica">
          Com os juros já dentro — é a soma de todas as parcelas. O app não calcula juros.
        </p>
      </div>

      <div className="grade-item-4">
        <div>
          <label className="mini-rotulo" htmlFor={'par-' + divida.id}>Parcelas</label>
          <input
            id={'par-' + divida.id}
            className="entrada"
            type="number"
            min={1}
            max={480}
            inputMode="numeric"
            value={divida.parcelas}
            onChange={(e) => void mudar({ parcelas: Math.max(1, Number(e.target.value) || 1) })}
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
          {divida.parcelas}x de {formatarReais(parcela)}
          {primeira !== parcela && ` (a primeira, de ${formatarReais(primeira)}, absorve o resto)`}.
        </p>
      )}

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
