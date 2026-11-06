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

import { Carregando } from '../componentes/Carregando';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { BarraDeProgresso } from '../componentes/graficos/BarraDeProgresso';
import { CATEGORIAS } from '../../compartilhado/constantes';
import { limitesDo } from '../../compartilhado/planos';
import {
  MESES_MINIMOS,
  atualizarProposta,
  avisoDeAtualizacao,
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
import { useConfirmar } from '../componentes/Confirmar';
import { Acompanhamento } from '../componentes/orcamento/Acompanhamento';
import { Envelope } from '../componentes/orcamento/Envelope';
import { useDesfazer } from '../componentes/Desfazer';
import { useApp } from '../estado';
import { formatarDataHora, mesAtual } from '../lib/datas';
import { formatarReais } from '../lib/dinheiro';
import { useVoltar } from '../lib/useVoltar';

export function Orcamento() {
  const voltar = useVoltar('/carteira');
  const { atualizarPendentes, iaLigada, modeloIa, offline, plano } = useApp();
  const financeiro = useFinanceiro();
  const orcamentos = useLiveQuery(listarOrcamentos, [], undefined);
  const perguntar = useConfirmar();
  const oferecerDesfazer = useDesfazer();

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
      <div className="app" role="main">
        <Carregando />
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
    const certeza = await perguntar({
      texto: 'Gerar a proposta de novo? Os tetos que você ajustou serão trocados.',
      rotulo: 'Gerar de novo',
    });
    if (!certeza) return;
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
    const removida = orc?.linhas.find((l) => l.categoria === categoria);
    void alterar((o) => ({ linhas: o.linhas.filter((l) => l.categoria !== categoria) }));
    // Tirar um teto nao pergunta: avisa e deixa desfazer. A linha volta como era
    // (teto, proposta e original), no fim da lista.
    if (!removida) return;
    oferecerDesfazer(`Teto de ${categoria} removido.`, () =>
      alterar((o) =>
        o.linhas.some((l) => l.categoria === categoria) ? {} : { linhas: [...o.linhas, removida] },
      ),
    );
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
    const certeza = await perguntar({
      texto: `Confirmar o orçamento de ${ano}? Os tetos passam a ser acompanhados mês a mês. Você ainda pode ajustar depois.`,
      rotulo: 'Confirmar orçamento',
    });
    if (!certeza) return;
    await confirmarOrcamento(orc.id);
    await atualizarPendentes();
    setAjustando(false);
  }

  async function voltarARascunho() {
    if (!orc) return;
    const certeza = await perguntar({
      texto: 'Voltar este orçamento a rascunho? O acompanhamento é pausado.',
      rotulo: 'Voltar a rascunho',
    });
    if (!certeza) return;
    await alterar((o) => ({
      situacao: 'rascunho',
      confirmadoEm: 0,
      linhas: o.linhas.map((l) => ({ ...l, original: null })),
    }));
  }

  async function excluir() {
    if (!orc) return;
    const certeza = await perguntar({
      texto: `Excluir o orçamento de ${ano}?`,
      rotulo: 'Excluir',
      perigo: true,
    });
    if (!certeza) return;
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
    <div className="app" role="main">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={voltar}>
            ‹
          </button>
          <h1>Orçamento</h1>
        </div>
      </header>

      <div className="acoes-linha" role="group" aria-label="Ano do orçamento">
        {[anoAtual, anoAtual + 1].map((a) => (
          <button
            key={a}
            type="button"
            className={'botao' + (a === ano ? ' botao-primario' : '')}
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
        <section className="cartao topo-12">
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
        <section className="cartao topo-12">
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

      {erro && <p className="aviso aviso-erro topo-12" role="alert">{erro}</p>}

      {orc && (
        <>
          <div className="linha-entre topo-12" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
            <h2 className="secao-titulo sem-topo">Ano de {ano}</h2>
            <span className={'selo' + (rascunho ? ' selo-pendente' : '')}>
              {rascunho ? 'rascunho' : 'confirmado'}
            </span>
          </div>
          {!rascunho && (
            <p className="dica">Confirmado em {formatarDataHora(orc.confirmadoEm)}.</p>
          )}

          {aviso !== null && (
            <div className="aviso aviso-atencao topo-12" role="status">
              <p className="sem-topo">
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
              <div className="linha-entre">
                <h3 className="secao-subtitulo">{bloco.macro}</h3>
                <span className="dica">
                  {formatarReais(bloco.teto)}/ano · {formatarReais(mediaMensal(bloco.teto))}/mês
                </span>
              </div>
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
                            aria-label={`${rascunho ? 'Usar' : 'Aplicar'} a proposta de ${linha.categoria}`}
                            onClick={() => mudarLinha(linha.categoria, { valorAnual: linha.proposto })}
                          >
                            {rascunho ? 'Usar' : 'Aplicar'}
                          </button>
                        </p>
                      )}
                      <button
                        type="button"
                        className="botao botao-perigo"
                        aria-label={`Remover o teto de ${linha.categoria}`}
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
                  <ul className="lista-limpa topo-12">
                    {novas.map((n) => (
                      <li key={n.categoria}>
                        {n.categoria} · {formatarReais(n.valorAnual)}{' '}
                        <button
                          type="button"
                          className="botao"
                          aria-label={`Incluir ${n.categoria} no orçamento`}
                          onClick={() => incluirLinha(n)}
                        >
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
            <div className="topo-12">
              <p className="dica">Parecer de {formatarDataHora(orc.parecer.geradoEm)}.</p>
              <div className="cartao">{orc.parecer.resumo}</div>
              {orc.parecer.sugestoes.map((s) => {
                const atual = orc.linhas.find((l) => l.categoria === s.categoria);
                return (
                  <div className="cartao" key={s.categoria}>
                    <strong>{s.categoria}</strong>
                    <p className="texto">{s.motivo}</p>
                    {s.valorAnualCentavos !== null && atual && (
                      <p className="dica">
                        Teto sugerido: {formatarReais(s.valorAnualCentavos)} (hoje{' '}
                        {formatarReais(atual.valorAnual)}){' '}
                        <button
                          type="button"
                          className="botao"
                          aria-label={`Aplicar o teto sugerido para ${s.categoria}`}
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
          </div>

          {/* Fora do rodape fixo: "Excluir" ao lado de "Confirmar" era o botao
              errado no lugar mais facil de tocar, e com tres botoes o texto
              quebrava em celular estreito. */}
          <div className="acoes">
            <button type="button" className="botao botao-perigo" onClick={() => void excluir()}>
              Excluir o orçamento de {ano}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
