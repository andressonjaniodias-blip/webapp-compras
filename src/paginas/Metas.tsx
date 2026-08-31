/**
 * As metas: o que voce quer comprar.
 *
 * E o que transforma sobra em plano. A conta vai nos DOIS SENTIDOS, e e isso que
 * a torna orçamento em vez de desejo:
 *
 *   com reserva definida  -> "guardando R$ 400/mês, a moto chega em set/2027"
 *   com prazo definido    -> "para tê-la em dez/2026 são R$ 780/mês"
 *
 * A reserva entra na previsao como saida COMPROMETIDA. E o ponto que faz tudo
 * fechar: se voce separa R$ 400 por mes para a moto, o simulador sabe que aquele
 * dinheiro nao esta disponivel para a compra de hoje.
 *
 * Nao ha tabela de aportes: `guardado` e um campo. Uma tabela duplicaria o que a
 * conta corrente ja registra e precisaria ser reconciliada — a mesma razao pela
 * qual a fatura e derivada em vez de gravada.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { limitesDo } from '../../compartilhado/planos';
import { panorama, planejarMeta } from '../../compartilhado/previsao';
import type { Meta } from '../../compartilhado/tipos';
import { atualizarMeta, criarMeta, excluirMeta } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { formatarReais } from '../lib/dinheiro';
import { deInputDataHora, nomeMes, paraInputDataHora } from '../lib/datas';
import { useApp } from '../estado';

export function Metas() {
  const navegar = useNavigate();
  const { atualizarPendentes, plano } = useApp();
  const { dados, gastoManual, carregando } = useFinanceiro();
  const [editando, setEditando] = useState<string | null>(null);

  const limites = limitesDo(plano);
  const agora = Date.now();
  const visao = panorama(dados, {
    meses: limites.mesesDePrevisao,
    agora,
    gastoManual,
  });
  const sobraMensal = visao.linhas.find((l) => !l.parcial)?.sobra ?? visao.sobraDoMes;

  const podeCriar = dados.metas.length < limites.metas;

  async function nova() {
    const id = await criarMeta();
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
          <h1>Metas</h1>
        </div>
      </header>

      {carregando && <p className="carregando">Carregando…</p>}

      {!carregando && dados.metas.length === 0 && (
        <p className="vazio">
          Nenhuma meta ainda.
          <br />
          Diga o que você quer comprar e o app calcula em quanto tempo dá.
        </p>
      )}

      <ul className="lista">
        {dados.metas.map((meta) => {
          if (editando === meta.id) {
            return (
              <li key={meta.id}>
                <FormMeta
                  meta={meta}
                  sobraMensal={sobraMensal}
                  onFechar={async () => {
                    await atualizarPendentes();
                    setEditando(null);
                  }}
                />
              </li>
            );
          }

          const plan = planejarMeta(meta, sobraMensal, agora);
          return (
            <li key={meta.id}>
              <button
                type="button"
                className="compra"
                style={{ display: 'block' }}
                onClick={() => setEditando(meta.id)}
              >
                <div className="compra-titulo">{meta.descricao || 'Sem nome'}</div>
                <div className="compra-meta" style={{ marginBottom: 8 }}>
                  {formatarReais(meta.guardado)} de {formatarReais(meta.valorAlvo)}
                  {plan.falta > 0 && ` · faltam ${formatarReais(plan.falta)}`}
                </div>
                <div className="barra">
                  <div className="barra-preenchida" style={{ width: plan.progresso * 100 + '%' }} />
                </div>
                <div className="compra-meta" style={{ marginTop: 6 }}>
                  <ResumoDoPlano plano={plan} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {!podeCriar && dados.metas.length > 0 && (
        <p className="dica">
          <span className="selo selo-plano">plano pago</span> Mais de uma meta ao mesmo tempo, com
          cenários e a reserva entrando na previsão.
        </p>
      )}

      <div className="rodape">
        <button type="button" className="botao botao-primario" disabled={!podeCriar} onClick={nova}>
          Nova meta
        </button>
      </div>
    </div>
  );
}

function ResumoDoPlano({ plano }: { plano: ReturnType<typeof planejarMeta> }) {
  if (plano.falta === 0) return <>Alcançada.</>;

  if (plano.reservaNecessaria !== null) {
    return (
      <>
        precisa de {formatarReais(plano.reservaNecessaria)}/mês ·{' '}
        <span className={plano.cabeNaSobra ? 'caiu' : 'subiu'}>
          {plano.cabeNaSobra ? 'cabe na sobra' : 'acima da sobra prevista'}
        </span>
      </>
    );
  }

  if (plano.competenciaAlvo === null) {
    return <>sem sobra para guardar no ritmo atual</>;
  }

  return (
    <>
      guardando {formatarReais(plano.reservaAtual)}/mês, chega em {nomeMes(plano.competenciaAlvo)}
    </>
  );
}

function FormMeta({
  meta,
  sobraMensal,
  onFechar,
}: {
  meta: Meta;
  sobraMensal: number;
  onFechar: () => Promise<void>;
}) {
  async function mudar(mudancas: Partial<Omit<Meta, 'id'>>) {
    await atualizarMeta(meta.id, mudancas);
  }

  const plano = planejarMeta(meta, sobraMensal, Date.now());

  return (
    <div className="form-item">
      <div className="campo">
        <label className="campo-rotulo" htmlFor={'desc-' + meta.id}>O que você quer comprar</label>
        <input
          id={'desc-' + meta.id}
          className="entrada"
          type="text"
          autoComplete="off"
          placeholder="Moto, notebook, viagem…"
          value={meta.descricao}
          onChange={(e) => void mudar({ descricao: e.target.value })}
        />
      </div>

      <div className="grade-item-4">
        <div>
          <label className="mini-rotulo" htmlFor={'alvo-' + meta.id}>Quanto custa</label>
          <CampoDinheiro
            id={'alvo-' + meta.id}
            valor={meta.valorAlvo}
            onChange={(valorAlvo) => void mudar({ valorAlvo })}
          />
        </div>
        <div>
          <label className="mini-rotulo" htmlFor={'guardado-' + meta.id}>Já guardei</label>
          <CampoDinheiro
            id={'guardado-' + meta.id}
            valor={meta.guardado}
            onChange={(guardado) => void mudar({ guardado })}
          />
        </div>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'reserva-' + meta.id}>
          Quanto separar por mês
        </label>
        <CampoDinheiro
          id={'reserva-' + meta.id}
          valor={meta.reservaMensal}
          onChange={(reservaMensal) => void mudar({ reservaMensal })}
        />
        <p className="dica">
          Deixe zerado para o app usar a sobra prevista. O que você colocar aqui vira saída
          comprometida na previsão — o simulador passa a saber que esse dinheiro não está livre.
        </p>
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor={'prazo-' + meta.id}>Prazo (opcional)</label>
        <input
          id={'prazo-' + meta.id}
          className="entrada"
          type="datetime-local"
          value={meta.prazoEm === null ? '' : paraInputDataHora(meta.prazoEm)}
          onChange={(e) => void mudar({ prazoEm: deInputDataHora(e.target.value) })}
        />
        <p className="dica">
          Com prazo, o app diz quanto seria preciso guardar por mês. Sem prazo, ele diz quando
          você chega no ritmo atual.
        </p>
      </div>

      {meta.valorAlvo > 0 && (
        <div className="cartao">
          <ResumoDoPlano plano={plano} />
        </div>
      )}

      <div className="form-item-rodape">
        <button
          type="button"
          className="botao botao-perigo"
          onClick={async () => {
            if (window.confirm('Excluir esta meta?')) {
              await excluirMeta(meta.id);
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
