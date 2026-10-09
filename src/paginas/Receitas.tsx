/**
 * As receitas: o dinheiro que entrou, lancamento a lancamento, mes a mes.
 *
 * ENTRADA E LANCAMENTO, nao regra. Esta tela substituiu duas: a de "Entradas",
 * que guardava a regra ("salario, todo dia 5", com aumento versionado), e uma
 * lista de datas derivada dela. A recorrencia foi abandonada — ninguem quer
 * cadastrar uma regra para depois ve-la virar datas —, entao quem lanca anota o
 * que caiu, na data em que caiu. O que vai entrar nos meses que vem a previsao
 * estima pela media (`estimarEntradaMensal`), e a Carteira mostra e deixa
 * corrigir essa estimativa.
 *
 * Tocar numa linha abre o formulario ali mesmo. Cada campo grava ao mudar,
 * como nas Metas: nao ha botao "Salvar" para esquecer.
 *
 * Sem total por mes de proposito. O Resumo tem o "Entrou", que deixa o vale de
 * fora (ver `ehDeCaixa`); uma segunda soma aqui, com outra definicao, voltaria
 * a produzir dois numeros quase iguais.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { SeletorChips } from '../componentes/SeletorChips';
import { ORIGENS_RENDA } from '../../compartilhado/constantes';
import type { Renda } from '../../compartilhado/tipos';
import { atualizarRenda, criarRenda, excluirRenda } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { chaveMes, deInputDataHora, formatarData, nomeMes, paraInputDataHora } from '../lib/datas';
import { useVoltar } from '../lib/useVoltar';
import { useApp } from '../estado';

type Conta = { id: string; apelido: string };

export function Receitas() {
  const voltar = useVoltar('/');
  const [params] = useSearchParams();
  const { atualizarPendentes } = useApp();
  const { dados, carregando } = useFinanceiro();
  // O painel e a Carteira podem chegar aqui com `?editar=<id>`, ja com o
  // formulario aberto.
  const [editando, setEditando] = useState<string | null>(params.get('editar'));

  async function nova() {
    const id = await criarRenda({ origem: ORIGENS_RENDA[0] });
    await atualizarPendentes();
    setEditando(id);
  }

  async function fechar() {
    await atualizarPendentes();
    setEditando(null);
  }

  const contas = dados.contas.map((c) => ({ id: c.id, apelido: c.apelido }));
  const agora = Date.now();

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={voltar}>
            ‹
          </button>
          <h1>Receitas</h1>
        </div>
      </header>

      {carregando && <p className="carregando">Carregando…</p>}

      {!carregando && dados.rendas.length === 0 && (
        <p className="vazio">
          Nenhuma entrada ainda.
          <br />
          Lance o que cair — salário, um extra, um reembolso. Com alguns meses lançados o app
          estima quanto costuma entrar.
        </p>
      )}

      <ul className="lista">{linhas(dados.rendas, contas, agora, editando, setEditando, fechar)}</ul>

      <div className="rodape">
        <button type="button" className="botao botao-primario" onClick={nova}>
          Nova entrada
        </button>
      </div>
    </div>
  );
}

/** Um cabeçalho quando o mes muda, como na lista de compras. */
function linhas(
  rendas: readonly Renda[],
  contas: readonly Conta[],
  agora: number,
  editando: string | null,
  abrir: (id: string) => void,
  fechar: () => Promise<void>,
) {
  const saida: React.ReactNode[] = [];
  let mesAnterior = '';

  // `dados.rendas` ja vem do mais recente para o mais antigo.
  for (const renda of rendas) {
    const mes = chaveMes(renda.data);
    if (mes !== mesAnterior) {
      mesAnterior = mes;
      saida.push(
        <li key={'mes-' + mes}>
          <h2 className="secao-titulo">{nomeMes(mes)}</h2>
        </li>,
      );
    }

    if (editando === renda.id) {
      saida.push(
        <li key={renda.id}>
          <FormEntrada renda={renda} contas={contas} onFechar={fechar} />
        </li>,
      );
      continue;
    }

    const conta = renda.contaId ? contas.find((c) => c.id === renda.contaId) : undefined;
    saida.push(
      <li key={renda.id}>
        <button type="button" className="compra" onClick={() => abrir(renda.id)}>
          <div className="compra-corpo">
            <div className="compra-titulo">{renda.origem || renda.descricao || 'Entrada'}</div>
            <div className="compra-meta">
              {formatarData(renda.data)}
              {renda.contaId && ` · cai em ${conta?.apelido ?? 'outra conta'}`}
              {renda.data > agora && ' · ainda não caiu'}
            </div>
          </div>
          <span className="compra-valor">{formatarReais(renda.valor)}</span>
        </button>
      </li>,
    );
  }

  return saida;
}

function FormEntrada({
  renda,
  contas,
  onFechar,
}: {
  renda: Renda;
  contas: readonly Conta[];
  onFechar: () => Promise<void>;
}) {
  async function mudar(mudancas: Partial<Omit<Renda, 'id'>>) {
    await atualizarRenda(renda.id, mudancas);
  }

  return (
    <div className="form-item">
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
        <label className="campo-rotulo" htmlFor={'valor-' + renda.id}>Valor</label>
        <CampoDinheiro
          id={'valor-' + renda.id}
          valor={renda.valor}
          onChange={(valor) => void mudar({ valor })}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'data-' + renda.id}>Quando caiu</label>
        <input
          id={'data-' + renda.id}
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
        <label className="campo-rotulo" htmlFor={'conta-' + renda.id}>Cai em</label>
        <select
          id={'conta-' + renda.id}
          className="entrada"
          value={renda.contaId ?? ''}
          onChange={(e) => void mudar({ contaId: e.target.value || null })}
        >
          <option value="">Não informado</option>
          {contas.map((conta) => (
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
        <label className="campo-rotulo" htmlFor={'desc-' + renda.id}>Descrição (opcional)</label>
        <input
          id={'desc-' + renda.id}
          className="entrada"
          type="text"
          autoComplete="off"
          value={renda.descricao}
          onChange={(e) => void mudar({ descricao: e.target.value })}
        />
      </div>

      <div className="form-item-rodape">
        <button
          type="button"
          className="botao botao-perigo"
          onClick={async () => {
            if (window.confirm('Excluir esta entrada?')) {
              await excluirRenda(renda.id);
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
