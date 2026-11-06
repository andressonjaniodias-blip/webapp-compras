/**
 * O orcamento anual, no estilo da LOA: um teto por categoria para o ano todo.
 *
 * O caminho e sempre o mesmo, e a tela mostra em qual passo voce esta:
 *
 *   0. ainda sem base    -> so um progresso ("N de 3 meses de uso"); nada de numero
 *   1. sem orcamento     -> "Gerar proposta" (calculada no aparelho, sem IA)
 *   2. rascunho          -> ajuste cada teto, peca o parecer da IA, confirme
 *   3. confirmado        -> acompanhe o gasto contra o teto, mes a mes
 *
 * TODO NUMERO daqui sai de `compartilhado/orcamento.ts`. A tela so desenha, e a
 * IA so comenta: nenhum teto nasce dela, ela sugere e voce aplica.
 *
 * PRINCIPIO 0: antes de 3 meses completos de compras, nao ha proposta, teto nem
 * envelope. O envelope ("cabe na renda?") so aparece com entrada lancada.
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { NavegadorDeMes } from '../componentes/NavegadorDeMes';
import { BarraDeProgresso } from '../componentes/graficos/BarraDeProgresso';
import { SeloDeEstado } from '../componentes/graficos/Estado';
import { CATEGORIAS } from '../../compartilhado/constantes';
import { limitesDo } from '../../compartilhado/planos';
import {
  MESES_MINIMOS,
  atualizarProposta,
  avisoDeAtualizacao,
  executar,
  executarMes,
  folgaDoOrcamento,
  mediaMensal,
  mesesDeUso,
  orcamentoLiberado,
  propor,
  somaPorMacro,
} from '../../compartilhado/orcamento';
import type { LinhaOrcamento } from '../../compartilhado/tipos';
import { pedirParecerDoOrcamento } from '../dados/api';
import {
  alterarOrcamento,
  atualizarOrcamento,
  confirmarOrcamento,
  criarOrcamento,
  excluirOrcamento,
  listarOrcamentos,
} from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import { useApp } from '../estado';
import { formatarDataHora, mesAtual, nomeMes } from '../lib/datas';
import { formatarReais } from '../lib/dinheiro';
import { useVoltar } from '../lib/useVoltar';

/** "2026-11" -> "novembro". O ano so atrapalha num rotulo de uma linha. */
function apenasMes(chave: string): string {
  return nomeMes(chave).replace(/ de \d{4}$/, '');
}

export function Orcamento() {
  const voltar = useVoltar('/carteira');
  const { atualizarPendentes, iaLigada, modeloIa, offline, plano } = useApp();
  const financeiro = useFinanceiro();
  const orcamentos = useLiveQuery(listarOrcamentos, [], undefined);

  const agora = Date.now();
  const anoAtual = new Date(agora).getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mesEscolhido, setMesEscolhido] = useState<string | null>(null);
  const [visao, setVisao] = useState<'mes' | 'ano'>('mes');
  const [ajustando, setAjustando] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [categoriaNova, setCategoriaNova] = useState('');

  if (orcamentos === undefined || financeiro.carregando) {
    return (
      <div className="app">
        <p className="carregando">Carregando…</p>
      </div>
    );
  }

  const { dados, entradaManual } = financeiro;
  const limites = limitesDo(plano);
  const usados = mesesDeUso(dados.compras, agora);
  const liberado = orcamentoLiberado(usados);
  const orc = orcamentos.find((o) => o.ano === ano) ?? null;
  const rascunho = orc?.situacao === 'rascunho';

  // A proposta viva: o que o gerador diria HOJE. Serve ao "gerar" e as categorias
  // que o orcamento ainda nao tem. Nunca altera teto.
  const propostaViva = propor(dados.compras, ano, agora);
  const novas = orc
    ? propostaViva.linhas.filter((p) => !orc.linhas.some((l) => l.categoria === p.categoria))
    : [];
  const aviso = orc ? avisoDeAtualizacao(orc, usados) : null;

  const mesesDoAno = Array.from({ length: 12 }, (_, i) => `${ano}-${String(12 - i).padStart(2, '0')}`).filter(
    (m) => ano > anoAtual || (ano === anoAtual && m <= mesAtual()) || ano < anoAtual,
  );
  const mes =
    mesEscolhido !== null && mesesDoAno.includes(mesEscolhido)
      ? mesEscolhido
      : ano === anoAtual
        ? mesAtual()
        : (mesesDoAno[mesesDoAno.length - 1] ?? `${ano}-01`);

  async function salvar(mudancas: Parameters<typeof atualizarOrcamento>[1]) {
    if (!orc) return;
    await atualizarOrcamento(orc.id, mudancas);
    await atualizarPendentes();
  }

  async function gerar() {
    setErro(null);
    const proposta = propor(dados.compras, ano, agora);
    if (proposta.linhas.length === 0) {
      setErro('Não há compras suficientes nos últimos meses para propor um orçamento.');
      return;
    }
    await criarOrcamento(ano, proposta.linhas, usados);
    await atualizarPendentes();
    setAjustando(false);
  }

  async function gerarDeNovo() {
    if (!window.confirm('Gerar a proposta de novo? Os tetos que você ajustou serão trocados.')) return;
    await gerar();
  }

  /** Edita a partir do que esta gravado, e nao da copia desta tela (ver `alterarOrcamento`). */
  async function alterar(fn: Parameters<typeof alterarOrcamento>[1]) {
    if (!orc) return;
    await alterarOrcamento(orc.id, fn);
    await atualizarPendentes();
  }

  function mudarLinha(categoria: string, mudancas: Partial<LinhaOrcamento>) {
    void alterar((o) => ({
      linhas: o.linhas.map((l) => (l.categoria === categoria ? { ...l, ...mudancas } : l)),
    }));
  }

  function removerLinha(categoria: string) {
    void alterar((o) => ({ linhas: o.linhas.filter((l) => l.categoria !== categoria) }));
  }

  function incluirLinha(linha: LinhaOrcamento) {
    void alterar((o) => {
      if (o.linhas.some((l) => l.categoria === linha.categoria)) return {};
      const original = o.situacao === 'confirmado' ? linha.valorAnual : null;
      return { linhas: [...o.linhas, { ...linha, original }] };
    });
  }

  function incluirManual() {
    if (!categoriaNova) return;
    const sugerida = propostaViva.linhas.find((p) => p.categoria === categoriaNova);
    incluirLinha(
      sugerida ?? { categoria: categoriaNova, valorAnual: 0, proposto: 0, original: null },
    );
    setCategoriaNova('');
  }

  async function confirmar() {
    if (!orc) return;
    if (
      !window.confirm(
        `Confirmar o orçamento de ${ano}? Os tetos passam a ser acompanhados mês a mês. Você ainda pode ajustar depois.`,
      )
    ) {
      return;
    }
    await confirmarOrcamento(orc.id);
    await atualizarPendentes();
    setAjustando(false);
  }

  async function voltarARascunho() {
    if (!orc) return;
    if (!window.confirm('Voltar este orçamento a rascunho? O acompanhamento é pausado.')) return;
    await alterar((o) => ({
      situacao: 'rascunho',
      confirmadoEm: 0,
      linhas: o.linhas.map((l) => ({ ...l, original: null })),
    }));
  }

  async function excluir() {
    if (!orc) return;
    if (!window.confirm(`Excluir o orçamento de ${ano}?`)) return;
    await excluirOrcamento(orc.id);
    await atualizarPendentes();
  }

  async function atualizar() {
    if (!orc) return;
    await alterar((o) => ({
      linhas: atualizarProposta(o.linhas, dados.compras, ano, agora).linhas,
      mesesDeBase: usados,
    }));
  }

  async function pedirParecer() {
    if (!orc) return;
    setPedindo(true);
    setErro(null);
    try {
      const parecer = await pedirParecerDoOrcamento(ano, orc.linhas);
      await salvar({ parecer: { ...parecer, modelo: parecer.modelo ?? modeloIa } });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível pedir o parecer.');
    } finally {
      setPedindo(false);
    }
  }

  async function aplicarSugestao(categoria: string, valor: number) {
    await alterar((o) => ({
      linhas: o.linhas.map((l) => (l.categoria === categoria ? { ...l, valorAnual: valor } : l)),
      parecer: o.parecer
        ? { ...o.parecer, sugestoes: o.parecer.sugestoes.filter((s) => s.categoria !== categoria) }
        : null,
    }));
  }

  const editavel = rascunho || ajustando;
  const livres = CATEGORIAS.filter((c) => !orc?.linhas.some((l) => l.categoria === c));

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={voltar}>
            ‹
          </button>
          <h1>Orçamento</h1>
        </div>
      </header>

      <div className="acoes" style={{ marginTop: 0, flexDirection: 'row' }}>
        {[anoAtual, anoAtual + 1].map((a) => (
          <button
            key={a}
            type="button"
            className={'botao' + (a === ano ? ' botao-primario' : '')}
            style={{ flex: 1 }}
            aria-pressed={a === ano}
            onClick={() => {
              setAno(a);
              setMesEscolhido(null);
              setAjustando(false);
              setErro(null);
            }}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Passo 0: sem base, sem numero. */}
      {!orc && !liberado && (
        <section className="cartao" style={{ marginTop: 12 }}>
          <strong>O orçamento abre depois de {MESES_MINIMOS} meses de uso</strong>
          <p className="dica">
            Um teto por categoria só faz sentido com histórico: o app precisa de pelo menos{' '}
            {MESES_MINIMOS} meses completos com compras lançadas. Você tem {usados}.
          </p>
          <BarraDeProgresso
            progresso={usados / MESES_MINIMOS}
            rotulo={`${usados} de ${MESES_MINIMOS} meses de uso`}
          />
          <p className="dica">
            {usados} de {MESES_MINIMOS} meses
          </p>
        </section>
      )}

      {/* Passo 1: liberado, mas ainda nao ha orcamento deste ano. */}
      {!orc && liberado && (
        <section className="cartao" style={{ marginTop: 12 }}>
          <strong>Orçamento de {ano}</strong>
          <p className="dica">
            O app propõe um teto anual para cada categoria a partir do que você gastou. Depois você
            ajusta, confirma e acompanha mês a mês.
            {usados < 6 && ` A base é de ${usados} meses: gastos que só acontecem em certas épocas podem estar faltando.`}
          </p>
          <button type="button" className="botao botao-primario botao-largo" onClick={gerar}>
            Gerar proposta de {ano}
          </button>
        </section>
      )}

      {erro && <p className="aviso aviso-erro" style={{ marginTop: 12 }}>{erro}</p>}

      {orc && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <h2 className="secao-titulo" style={{ margin: 0 }}>Orçamento de {ano}</h2>
            <span className={'selo' + (rascunho ? ' selo-pendente' : '')}>
              {rascunho ? 'rascunho' : 'confirmado'}
            </span>
          </div>
          {!rascunho && (
            <p className="dica">Confirmado em {formatarDataHora(orc.confirmadoEm)}.</p>
          )}

          {aviso !== null && (
            <div className="aviso aviso-atencao" style={{ marginTop: 12 }}>
              <p style={{ margin: 0 }}>
                Você já tem {aviso} meses de uso. Quer atualizar o orçamento com esse histórico? Os
                tetos só mudam se você aplicar.
              </p>
              <div className="acoes">
                <button type="button" className="botao" onClick={() => void atualizar()}>
                  Atualizar
                </button>
                <button
                  type="button"
                  className="botao"
                  onClick={() => void salvar({ marcoDispensado: aviso })}
                >
                  Dispensar
                </button>
              </div>
            </div>
          )}

          {/* Acompanhamento: so depois de confirmado. */}
          {!rascunho && <Acompanhamento
            orc={orc}
            mes={mes}
            mesesDoAno={mesesDoAno}
            onMes={setMesEscolhido}
            compras={dados.compras}
            agora={agora}
            visao={visao}
            onVisao={setVisao}
          />}

          <h2 className="secao-titulo">{rascunho ? 'Tetos por categoria' : 'Ajustar os tetos'}</h2>
          {!rascunho && !ajustando && (
            <button type="button" className="botao botao-largo" onClick={() => setAjustando(true)}>
              Ajustar tetos
            </button>
          )}

          {editavel && (
            <>
              {somaPorMacro(orc.linhas).map((bloco) => (
              <section key={bloco.macro}>
              <h3
                className="secao-titulo"
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
              >
                <span>{bloco.macro}</span>
                <span>
                  {formatarReais(bloco.teto)}/ano · {formatarReais(mediaMensal(bloco.teto))}/mês
                </span>
              </h3>
              <ul className="lista">
                {bloco.linhas.map((linha) => {
                  const diferente = linha.proposto !== linha.valorAnual;
                  return (
                    <li key={linha.categoria} className="cartao">
                      <label className="campo-rotulo" htmlFor={'teto-' + linha.categoria}>
                        {linha.categoria}
                      </label>
                      <CampoDinheiro
                        id={'teto-' + linha.categoria}
                        valor={linha.valorAnual}
                        onChange={(valorAnual) => mudarLinha(linha.categoria, { valorAnual })}
                      />
                      <p className="dica">
                        Média de {formatarReais(mediaMensal(linha.valorAnual))} por mês
                        {linha.original !== null && linha.original !== linha.valorAnual &&
                          ` · ajustado de ${formatarReais(linha.original)}`}
                      </p>
                      {diferente && (
                        <p className="dica">
                          {rascunho ? 'Proposta do app' : 'Nova proposta'}: {formatarReais(linha.proposto)}{' '}
                          <button
                            type="button"
                            className="botao"
                            onClick={() => mudarLinha(linha.categoria, { valorAnual: linha.proposto })}
                          >
                            {rascunho ? 'Usar' : 'Aplicar'}
                          </button>
                        </p>
                      )}
                      <button
                        type="button"
                        className="botao botao-perigo"
                        onClick={() => removerLinha(linha.categoria)}
                      >
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ul>
              </section>
              ))}

              {novas.length > 0 && (
                <div className="cartao">
                  <strong>Categorias que a proposta tem e o orçamento não</strong>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none' }}>
                    {novas.map((n) => (
                      <li key={n.categoria} style={{ marginBottom: 6 }}>
                        {n.categoria} · {formatarReais(n.valorAnual)}{' '}
                        <button type="button" className="botao" onClick={() => incluirLinha(n)}>
                          Incluir
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {livres.length > 0 && (
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="categoria-nova">Incluir outra categoria</label>
                  <select
                    id="categoria-nova"
                    className="entrada"
                    value={categoriaNova}
                    onChange={(e) => setCategoriaNova(e.target.value)}
                  >
                    <option value="">Escolha…</option>
                    {livres.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button type="button" className="botao" disabled={!categoriaNova} onClick={incluirManual}>
                    Incluir
                  </button>
                </div>
              )}
            </>
          )}

          {!rascunho && ajustando && (
            <button type="button" className="botao botao-largo" onClick={() => setAjustando(false)}>
              Pronto
            </button>
          )}

          <Envelope
            dados={dados}
            orc={orc}
            agora={agora}
            entradaManual={entradaManual}
          />

          <h2 className="secao-titulo">Parecer da IA</h2>
          {!limites.ia && (
            <p className="dica">
              <span className="selo selo-plano">plano pago</span> A IA lê o histórico por
              categoria, confere se os tetos cabem na renda e sugere ajustes que você aplica ou
              ignora.
            </p>
          )}
          {limites.ia && !iaLigada && (
            <p className="dica">
              O parecer está indisponível no momento: falta configurar a chave da Anthropic no
              servidor. O orçamento continua funcionando normalmente.
            </p>
          )}
          {limites.ia && iaLigada && (
            <>
              <button
                type="button"
                className="botao botao-largo"
                disabled={pedindo || offline || orc.linhas.length === 0}
                onClick={() => void pedirParecer()}
              >
                {pedindo
                  ? 'Lendo o orçamento…'
                  : orc.parecer
                    ? 'Pedir outro parecer'
                    : 'Pedir parecer da IA'}
              </button>
              {offline && <p className="dica">Precisa de internet para pedir o parecer.</p>}
            </>
          )}
          {orc.parecer && (
            <div style={{ marginTop: 12 }}>
              <p className="dica">Parecer de {formatarDataHora(orc.parecer.geradoEm)}.</p>
              <div className="cartao">{orc.parecer.resumo}</div>
              {orc.parecer.sugestoes.map((s) => {
                const atual = orc.linhas.find((l) => l.categoria === s.categoria);
                return (
                  <div className="cartao" key={s.categoria}>
                    <strong>{s.categoria}</strong>
                    <p className="dica" style={{ color: 'var(--texto)' }}>{s.motivo}</p>
                    {s.valorAnualCentavos !== null && atual && (
                      <p className="dica">
                        Teto sugerido: {formatarReais(s.valorAnualCentavos)} (hoje{' '}
                        {formatarReais(atual.valorAnual)}){' '}
                        <button
                          type="button"
                          className="botao"
                          onClick={() => void aplicarSugestao(s.categoria, s.valorAnualCentavos!)}
                        >
                          Aplicar
                        </button>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="rodape">
            {rascunho ? (
              <>
                <button type="button" className="botao" onClick={() => void gerarDeNovo()}>
                  Gerar de novo
                </button>
                <button
                  type="button"
                  className="botao botao-primario"
                  disabled={orc.linhas.length === 0}
                  onClick={() => void confirmar()}
                >
                  Confirmar orçamento
                </button>
              </>
            ) : (
              <button type="button" className="botao" onClick={() => void voltarARascunho()}>
                Voltar a rascunho
              </button>
            )}
            <button type="button" className="botao botao-perigo" onClick={() => void excluir()}>
              Excluir
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * O acompanhamento: DUAS visoes do mesmo teto, separadas.
 *
 *   Mes  -> o limite deste mes (a media do teto, ajustada pelo que ja foi gasto) contra o gasto do mes
 *   Ano  -> o teto do ano contra o gasto do ano
 *
 * Cada visao agrupa em macrocategorias, que so organizam a exibicao: o teto
 * continua sendo de cada subcategoria. Todo numero vem de `executarMes` e
 * `executar`; aqui so se desenha.
 */
function Acompanhamento({
  orc,
  mes,
  mesesDoAno,
  onMes,
  compras,
  agora,
  visao,
  onVisao,
}: {
  orc: { ano: number; linhas: LinhaOrcamento[] };
  mes: string;
  mesesDoAno: string[];
  onMes: (mes: string) => void;
  compras: Parameters<typeof executar>[0];
  agora: number;
  visao: 'mes' | 'ano';
  onVisao: (visao: 'mes' | 'ano') => void;
}) {
  return (
    <>
      <h2 className="secao-titulo">Acompanhamento</h2>
      <div className="acoes" style={{ marginTop: 0, flexDirection: 'row' }}>
        {(['mes', 'ano'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={'botao' + (v === visao ? ' botao-primario' : '')}
            style={{ flex: 1 }}
            aria-pressed={v === visao}
            onClick={() => onVisao(v)}
          >
            {v === 'mes' ? 'Mês' : 'Ano'}
          </button>
        ))}
      </div>

      {visao === 'mes' ? (
        <VisaoMensal
          orc={orc}
          mes={mes}
          mesesDoAno={mesesDoAno}
          onMes={onMes}
          compras={compras}
          agora={agora}
        />
      ) : (
        <VisaoAnual orc={orc} mes={mes} compras={compras} agora={agora} />
      )}
    </>
  );
}

/** "+R$ 45,45" / "−R$ 12,00": quanto o gasto dos meses anteriores mexeu no limite. */
function textoDoAjuste(ajuste: number): string | null {
  if (ajuste === 0) return null;
  return ajuste > 0
    ? `sobe ${formatarReais(ajuste)} por você ter gasto menos antes`
    : `desce ${formatarReais(-ajuste)} por você ter gasto mais antes`;
}

function VisaoMensal({
  orc,
  mes,
  mesesDoAno,
  onMes,
  compras,
  agora,
}: {
  orc: { ano: number; linhas: LinhaOrcamento[] };
  mes: string;
  mesesDoAno: string[];
  onMes: (mes: string) => void;
  compras: Parameters<typeof executar>[0];
  agora: number;
}) {
  const exec = executarMes(compras, orc, mes, agora);

  return (
    <>
      <NavegadorDeMes meses={mesesDoAno} mes={mes} onChange={onMes} />

      <section className="cartao">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span className="dica">gasto em {apenasMes(mes)}</span>
          <SeloDeEstado estado={exec.estado} />
        </div>
        <div className="total-grande">{formatarReais(exec.gasto)}</div>
        <BarraDeProgresso
          progresso={exec.limite > 0 ? exec.gasto / exec.limite : exec.gasto > 0 ? 1 : 0}
          rotulo={`${formatarReais(exec.gasto)} gastos de um limite de ${formatarReais(exec.limite)} em ${apenasMes(mes)}`}
        />
        <p className="dica">
          de {formatarReais(exec.limite)} de limite do mês ·{' '}
          {exec.estourou > 0
            ? `passou ${formatarReais(exec.estourou)}`
            : `restam ${formatarReais(exec.restante)}`}
        </p>
        <p className="dica">
          O limite do mês é a média do teto anual, ajustada pelo que você já gastou no ano.
        </p>
      </section>

      {exec.macros.map((bloco) => (
        <section key={bloco.macro}>
          <h3
            className="secao-titulo"
            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}
          >
            <span>{bloco.macro}</span>
            <SeloDeEstado estado={bloco.estado} />
          </h3>
          <p className="dica" style={{ marginTop: 0 }}>
            {formatarReais(bloco.gasto)} de {formatarReais(bloco.limite)}
          </p>
          <ul className="lista">
            {bloco.linhas.map((l) => {
              const ajuste = textoDoAjuste(l.ajuste);
              return (
                <li key={l.categoria} className="cartao">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{l.categoria}</strong>
                    <SeloDeEstado estado={l.estado} />
                  </div>
                  <p className="dica" style={{ margin: '4px 0' }}>
                    {formatarReais(l.gastoNoMes)} de {formatarReais(l.limiteDoMes)}
                  </p>
                  <BarraDeProgresso
                    progresso={
                      l.limiteDoMes > 0 ? l.gastoNoMes / l.limiteDoMes : l.gastoNoMes > 0 ? 1 : 0
                    }
                    rotulo={`${l.categoria}: ${formatarReais(l.gastoNoMes)} de ${formatarReais(l.limiteDoMes)}`}
                  />
                  <p className="dica">
                    {l.estourou > 0
                      ? `passou ${formatarReais(l.estourou)} do limite · `
                      : `restam ${formatarReais(l.restanteDoMes)} · `}
                    média de {formatarReais(l.media)}
                    {ajuste && ` · o limite ${ajuste}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {exec.fora.length > 0 && (
        <div className="cartao">
          <strong>Fora do orçamento</strong>
          <p className="dica">Categorias com gasto em {apenasMes(mes)} e sem teto.</p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {exec.fora.map((f) => (
              <li key={f.categoria}>
                {f.categoria} · {formatarReais(f.gastoNoMes)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function VisaoAnual({
  orc,
  mes,
  compras,
  agora,
}: {
  orc: { ano: number; linhas: LinhaOrcamento[] };
  mes: string;
  compras: Parameters<typeof executar>[0];
  agora: number;
}) {
  const exec = executar(compras, orc, mes, agora);
  const progressoGeral = exec.totalDosTetos > 0 ? exec.gastoNoAno / exec.totalDosTetos : 0;

  return (
    <>
      <section className="cartao" style={{ marginTop: 12 }}>
        <span className="dica">gasto no ano, nas categorias com teto</span>
        <div className="total-grande">{formatarReais(exec.gastoNoAno)}</div>
        <BarraDeProgresso
          progresso={progressoGeral}
          rotulo={`${formatarReais(exec.gastoNoAno)} gastos de ${formatarReais(exec.totalDosTetos)} em tetos`}
        />
        <p className="dica">
          de {formatarReais(exec.totalDosTetos)} em tetos · ainda cabem {formatarReais(exec.restante)}
          {exec.mesesQueFaltam > 0 &&
            ` em ${exec.mesesQueFaltam} ${exec.mesesQueFaltam === 1 ? 'mês' : 'meses'}`}
        </p>
      </section>

      {exec.macros.map((bloco) => (
        <section key={bloco.macro}>
          <h3
            className="secao-titulo"
            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}
          >
            <span>{bloco.macro}</span>
            <SeloDeEstado estado={bloco.estado} />
          </h3>
          <p className="dica" style={{ marginTop: 0 }}>
            {formatarReais(bloco.gastoNoAno)} de {formatarReais(bloco.teto)} no ano
          </p>
          <ul className="lista">
            {bloco.linhas.map((l) => (
              <li key={l.categoria} className="cartao">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{l.categoria}</strong>
                  <SeloDeEstado estado={l.estado} />
                </div>
                <p className="dica" style={{ margin: '4px 0' }}>
                  {formatarReais(l.gastoNoAno)} de {formatarReais(l.teto)}
                  {l.ajustadoDe !== null && ` · ajustado de ${formatarReais(l.ajustadoDe)}`}
                </p>
                <BarraDeProgresso
                  progresso={l.teto > 0 ? l.gastoNoAno / l.teto : l.gastoNoAno > 0 ? 1 : 0}
                  rotulo={`${l.categoria}: ${formatarReais(l.gastoNoAno)} de ${formatarReais(l.teto)}`}
                />
                <p className="dica">
                  {l.estado === 'estoura'
                    ? `passou ${formatarReais(l.estourou)} do teto`
                    : `restam ${formatarReais(l.restante)} no ano`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {exec.fora.length > 0 && (
        <div className="cartao">
          <strong>Fora do orçamento</strong>
          <p className="dica">Categorias com gasto no ano e sem teto.</p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
            {exec.fora.map((f) => (
              <li key={f.categoria}>
                {f.categoria} · {formatarReais(f.gastoNoAno)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Cabe na renda? Some sem entrada lancada: o numero diria "nao cabe" por falta de dado. */
function Envelope({
  dados,
  orc,
  agora,
  entradaManual,
}: {
  dados: Parameters<typeof folgaDoOrcamento>[0];
  orc: { ano: number; linhas: LinhaOrcamento[] };
  agora: number;
  entradaManual: number | null;
}) {
  const folga = folgaDoOrcamento(dados, orc, agora, entradaManual);
  if (folga === null) return null;

  return (
    <>
      <h2 className="secao-titulo">Cabe na renda?</h2>
      <section className="cartao">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>Entradas estimadas</span>
          <strong>{formatarReais(folga.entradas)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>− Tetos que ainda cabem</span>
          <strong>{formatarReais(folga.tetos)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>− Parcelas de empréstimo</span>
          <strong>{formatarReais(folga.dividas)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>− Reserva das metas</span>
          <strong>{formatarReais(folga.metas)}</strong>
        </div>
        <hr />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <SeloDeEstado estado={folga.folga < 0 ? 'estoura' : 'cabe'} />
          <strong className={folga.folga < 0 ? 'valor-ruim' : 'valor-bom'}>
            {formatarReais(folga.folga)}
          </strong>
        </div>
        <p className="dica">
          {folga.folga < 0
            ? 'A soma dos tetos, das parcelas e das metas passa do que deve entrar.'
            : 'Sobra depois dos tetos, das parcelas e das metas.'}{' '}
          É estimativa: a entrada é a média dos últimos meses
          {folga.entradaFraca && ' (poucos meses, então é fraca)'}. Parcelas de cartão ficam de
          fora: a compra no crédito já pesa no teto, na data da compra.
        </p>
      </section>
    </>
  );
}
