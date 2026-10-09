/**
 * A tela de uma entrada: o dinheiro que entrou, na data em que entrou.
 *
 * No mesmo padrao da tela de uma compra, e pelo mesmo motivo: abrir uma entrada
 * na propria lista deixava o formulario solto no meio das linhas e fora da coluna
 * da tela. Aqui ela tem tela propria, e o "‹" volta para a lista de onde se veio.
 *
 * ENTRADA E LANCAMENTO, nao regra: nao ha tipo, nem "a partir de quando". Cada
 * campo grava ao mudar, como na compra — nao ha botao "Salvar" para esquecer.
 */

import { useRef } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { SeletorChips } from '../componentes/SeletorChips';
import { ORIGENS_RENDA } from '../../compartilhado/constantes';
import type { Renda } from '../../compartilhado/tipos';
import { atualizarRenda, excluirRenda } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { deInputDataHora, formatarData, paraInputDataHora } from '../lib/datas';
import { useVoltar } from '../lib/useVoltar';
import { useApp } from '../estado';

export function EditarReceita() {
  const { id = '' } = useParams();
  const voltar = useVoltar('/receitas');
  // Marca a saida por exclusao: sem ela o `Navigate` ("a entrada sumiu") dispara
  // junto com o voltar e leva para outro lugar.
  const saindo = useRef(false);
  const { atualizarPendentes } = useApp();
  const { dados, carregando } = useFinanceiro();

  if (carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  const renda = dados.rendas.find((r) => r.id === id);
  if (!renda) return saindo.current ? null : <Navigate to="/receitas" replace />;

  async function mudar(mudancas: Partial<Omit<Renda, 'id'>>) {
    await atualizarRenda(id, mudancas);
    await atualizarPendentes();
  }

  async function apagar() {
    if (!window.confirm('Excluir esta entrada? Isso some também dos outros aparelhos.')) return;
    saindo.current = true;
    await excluirRenda(id);
    await atualizarPendentes();
    voltar();
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={voltar}>
            ‹
          </button>
          <h1>Entrada</h1>
          <button type="button" className="botao-icone" aria-label="Excluir entrada" onClick={apagar}>
            🗑
          </button>
        </div>
      </header>

      <section className="cartao">
        <span className="campo-rotulo">Valor</span>
        <div className="total-grande">{formatarReais(renda.valor)}</div>
        <p className="dica">{formatarData(renda.data)}</p>
      </section>

      <div className="campo">
        <span className="campo-rotulo">Origem</span>
        <SeletorChips
          opcoes={ORIGENS_RENDA}
          valor={renda.origem}
          rotulo="Origem"
          permitirNovo
          onChange={(origem) => void mudar({ origem })}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="valor">Valor</label>
        <CampoDinheiro id="valor" valor={renda.valor} onChange={(valor) => void mudar({ valor })} />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="quando">Quando caiu</label>
        <input
          id="quando"
          className="entrada"
          type="datetime-local"
          value={paraInputDataHora(renda.data)}
          onChange={(e) => {
            const data = deInputDataHora(e.target.value);
            if (data !== null) void mudar({ data });
          }}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="conta">Cai em</label>
        <select
          id="conta"
          className="entrada"
          value={renda.contaId ?? ''}
          onChange={(e) => void mudar({ contaId: e.target.value || null })}
        >
          <option value="">Não informado</option>
          {dados.contas.map((conta) => (
            <option key={conta.id} value={conta.id}>{conta.apelido}</option>
          ))}
        </select>
        <p className="dica">
          Sem conta informada a entrada <strong>não soma em saldo nenhum</strong>, e a Carteira
          avisa. Recarga de vale alimentação aponta para o vale: o dinheiro fica lá, não na
          conta.
        </p>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="descricao">Descrição (opcional)</label>
        <input
          id="descricao"
          className="entrada"
          type="text"
          autoComplete="off"
          value={renda.descricao}
          onChange={(e) => void mudar({ descricao: e.target.value })}
        />
      </div>

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={voltar}>
          Concluir
        </button>
      </div>
    </div>
  );
}
