/**
 * Sincronizacao, exportacao, backup e as preferencias do aparelho.
 *
 * Duas coisas aqui sao plano de recuperacao, nao conveniencia:
 *
 * - "Reenviar tudo" reconstroi a nuvem inteira a partir deste aparelho. Como o
 *   dado real mora aqui, perder o banco na nuvem vira uma tarefa de dois
 *   minutos em vez de uma perda definitiva.
 * - O backup .json e a copia que nao depende de provedor nenhum. Sai e volta,
 *   com as lapides junto, para uma compra excluida nao ressuscitar na
 *   restauracao. Ele fica no plano GRATIS por principio: segurar o dado de
 *   alguem como refem do plano e uma linha que este projeto nao cruza.
 *
 * O "modo simples" e a saida do Princípio 0: esconde tudo que e financeiro sem
 * apagar nada. E preferencia de aparelho, entao o celular pode ser um caderninho
 * enquanto o PC mostra a previsao inteira.
 */

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { exportarBackup, exportarCsv, exportarExcel, importarBackup } from '../lib/exportar';
import { reenviarTudo } from '../dados/sincronizacao';
import {
  atualizarCompra,
  listarCompras,
  listarItens,
} from '../dados/compras';
import { categoriasPorItem } from '../dados/catalogo';
import {
  criarRegra,
  excluirRegra,
  gravarModoCategorizacao,
  gravarModoSimples,
  lerModoCategorizacao,
  lerModoSimples,
  listarRegras,
} from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import {
  propostasDeRevisao,
  resumirHistorico,
  type ModoCategorizacao,
  type Proposta,
} from '../../compartilhado/categorizacao';
import { limitesDo } from '../../compartilhado/planos';
import { pedirRegras } from '../dados/api';
import { formatarReais } from '../lib/dinheiro';
import { formatarData, formatarDataHora } from '../lib/datas';
import { useApp } from '../estado';

export function Ajustes() {
  const navegar = useNavigate();
  const {
    pendentes, ultimaEm, situacao, offline, iaLigada, plano,
    sincronizarAgora, encerrarSessao, atualizarPendentes,
  } = useApp();
  const financeiro = useFinanceiro();

  const [recado, setRecado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const limites = limitesDo(plano);
  const modo = useLiveQuery(lerModoCategorizacao, [], undefined);
  const simples = useLiveQuery(lerModoSimples, [], false);
  const regras = useLiveQuery(listarRegras, [], []);

  async function tentar(acao: () => Promise<string>) {
    setOcupado(true);
    setRecado(null);
    setErro(null);
    try {
      setRecado(await acao());
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não deu certo.');
    } finally {
      setOcupado(false);
      await atualizarPendentes();
    }
  }

  async function aoEscolherArquivo(lista: FileList | null) {
    const escolhido = lista?.[0];
    if (!escolhido) return;
    await tentar(async () => {
      const resultado = await importarBackup(await escolhido.text());
      return `Restaurados ${resultado.compras} compra(s) e ${resultado.itens} item(ns). Sincronize para enviá-los.`;
    });
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={() => navegar('/')}>
            ‹
          </button>
          <h1>Ajustes</h1>
        </div>
      </header>

      {recado && <p className="aviso">{recado}</p>}
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      <h2 className="secao-titulo">Controle financeiro</h2>
      <div className="cartao">
        {!financeiro.temContas && !financeiro.temRenda ? (
          <>
            <p style={{ marginTop: 0 }}>
              Contas, entradas e previsão dos próximos meses — para o app responder
              <strong> “posso comprar isto?”</strong> antes da compra.
            </p>
            <p className="dica">
              Nada disto é obrigatório. Enquanto você não cadastrar nada, o app continua sendo
              exatamente o caderno de compras que já era.
            </p>
            <div className="acoes" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="botao botao-primario botao-largo"
                onClick={() => navegar('/contas')}
              >
                Começar cadastrando uma conta
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="acoes" style={{ marginTop: 0 }}>
              <button type="button" className="botao botao-largo" onClick={() => navegar('/carteira')}>
                Abrir a Carteira
              </button>
            </div>
            <label className="interruptor">
              <input
                type="checkbox"
                checked={simples}
                onChange={(e) => void gravarModoSimples(e.target.checked)}
              />
              <span>Modo simples</span>
            </label>
            <p className="dica">
              Esconde tudo que é financeiro neste aparelho. <strong>Não apaga nada</strong> — e
              vale só aqui, então o celular pode ficar simples enquanto o PC mostra tudo.
            </p>
          </>
        )}
      </div>

      <h2 className="secao-titulo">Categoria automática</h2>
      <div className="cartao">
        <div className="campo">
          <label className="campo-rotulo" htmlFor="modo">Como o app preenche a categoria</label>
          <select
            id="modo"
            className="entrada"
            value={modo ?? 'sugerir'}
            onChange={(e) => void gravarModoCategorizacao(e.target.value as ModoCategorizacao)}
          >
            <option value="desligado">Desligado — eu escolho sempre</option>
            <option value="sugerir">Sugerir e dizer por quê</option>
            <option value="automatico">Preencher sozinho quando tiver certeza</option>
          </select>
        </div>
        <p className="dica">
          O palpite vem do seu próprio histórico: se “Bom Preço” virou Mercado nas últimas doze
          vezes, a décima terceira é Mercado. Ele nunca sobrescreve uma categoria que você
          tocou.
        </p>

        <RegrasDeCategoria
          regras={regras}
          iaLiberada={limites.ia && iaLigada}
          plano={plano}
          onMudou={atualizarPendentes}
        />

        <RevisaoRetroativa onPronto={atualizarPendentes} />
      </div>

      <h2 className="secao-titulo">Sincronização</h2>
      <div className="cartao">
        <p style={{ margin: '0 0 10px' }}>
          {pendentes === 0
            ? 'Tudo sincronizado.'
            : `${pendentes} registro(s) esperando para subir.`}
          {offline && ' O servidor está inalcançável no momento.'}
        </p>
        <p className="dica" style={{ marginBottom: 12 }}>
          {ultimaEm ? 'Última vez: ' + formatarDataHora(ultimaEm) : 'Ainda não sincronizou neste aparelho.'}
        </p>

        <div className="acoes" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="botao botao-primario botao-largo"
            disabled={situacao === 'sincronizando' || ocupado}
            onClick={() => void sincronizarAgora(true)}
          >
            {situacao === 'sincronizando' ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>

          <button
            type="button"
            className="botao botao-largo"
            disabled={situacao === 'sincronizando' || ocupado}
            onClick={() =>
              void tentar(async () => {
                const r = await reenviarTudo();
                return `Reenviados ${r.enviados} registro(s) para a nuvem.`;
              })
            }
          >
            Reenviar tudo para a nuvem
          </button>
        </div>
        <p className="dica">
          Reenviar tudo serve para reconstruir a nuvem caso o banco lá se perca. Não apaga
          nada daqui.
        </p>
      </div>

      <h2 className="secao-titulo">Exportar</h2>
      <div className="cartao">
        <div className="acoes" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="botao botao-largo"
            disabled={ocupado || !limites.exportarXlsx}
            onClick={() => void tentar(async () => { await exportarExcel(); return 'Planilha gerada.'; })}
          >
            Planilha .xlsx completa
            {!limites.exportarXlsx && <span className="selo selo-plano">plano pago</span>}
          </button>
          <button
            type="button"
            className="botao botao-largo"
            disabled={ocupado}
            onClick={() => void tentar(async () => { await exportarCsv(); return 'CSV gerado.'; })}
          >
            Arquivo .csv
          </button>
        </div>
        <p className="dica">
          A planilha sai com valores como número e datas como data, então soma e tabela
          dinâmica funcionam. Ela traz uma aba por assunto, incluindo Parcelas e Previsão.
        </p>
      </div>

      <h2 className="secao-titulo">Backup</h2>
      <div className="cartao">
        <div className="acoes" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="botao botao-largo"
            disabled={ocupado}
            onClick={() => void tentar(async () => { await exportarBackup(); return 'Backup salvo.'; })}
          >
            Salvar backup .json
          </button>
          <button
            type="button"
            className="botao botao-largo"
            disabled={ocupado}
            onClick={() => arquivo.current?.click()}
          >
            Restaurar backup .json
          </button>
          <input
            ref={arquivo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void aoEscolherArquivo(e.target.files)}
          />
        </div>
        <p className="dica">
          O backup nunca depende do plano: é o seu dado.
        </p>
      </div>

      <h2 className="secao-titulo">Conta</h2>
      <div className="cartao">
        <p className="dica" style={{ marginTop: 0 }}>
          Plano: <strong>{plano === 'pago' ? 'pago' : 'grátis'}</strong>. Dicas de IA:{' '}
          {!limites.ia
            ? 'do plano pago'
            : iaLigada
              ? 'ligadas'
              : 'indisponíveis (sem chave no servidor)'}.
        </p>
        <button type="button" className="botao botao-largo botao-perigo" onClick={() => void encerrarSessao()}>
          Sair desta sessão
        </button>
        <p className="dica">
          Sair não apaga nada deste aparelho — só desconecta da nuvem até você entrar de novo.
        </p>
      </div>
    </div>
  );
}

/** As regras explicitas — a unica parte da categorizacao que sincroniza. */
function RegrasDeCategoria({
  regras,
  iaLiberada,
  plano,
  onMudou,
}: {
  regras: readonly { id: string; termo: string; categoria: string }[];
  iaLiberada: boolean;
  plano: string;
  onMudou: () => Promise<void>;
}) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedirDaIa() {
    setBuscando(true);
    setErro(null);
    try {
      const { regras: propostas } = await pedirRegras();
      for (const proposta of propostas) {
        await criarRegra(proposta.termo, proposta.categoria);
      }
      await onMudou();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não deu certo.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      {regras.length > 0 && (
        <ul className="lista" style={{ marginTop: 8 }}>
          {regras.map((regra) => (
            <li key={regra.id}>
              <div className="item-linha">
                <div className="item-corpo">
                  <div className="item-nome">“{regra.termo}” → {regra.categoria}</div>
                </div>
                <button
                  type="button"
                  className="botao-icone"
                  aria-label="Excluir regra"
                  onClick={async () => {
                    await excluirRegra(regra.id);
                    await onMudou();
                  }}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="aviso aviso-erro">{erro}</p>}

      <button
        type="button"
        className="botao botao-largo"
        disabled={!iaLiberada || buscando}
        onClick={() => void pedirDaIa()}
      >
        {buscando ? 'Lendo seu histórico…' : 'A IA propõe regras a partir do histórico'}
        {plano !== 'pago' && <span className="selo selo-plano">plano pago</span>}
      </button>
      <p className="dica">
        Uma chamada de API só, e as regras continuam valendo sem internet. O app não gasta IA
        por lançamento.
      </p>
    </>
  );
}

/**
 * A revisao retroativa.
 *
 * Varre as compras em "Outros" e propoe categoria. Nada e aplicado sozinho: a
 * lista aparece e voce aceita o que quiser. E como o historico velho passa a
 * valer para o resumo e para a previsao sem nada ser reescrito nas suas costas.
 */
function RevisaoRetroativa({ onPronto }: { onPronto: () => Promise<void> }) {
  const [propostas, setPropostas] = useState<Proposta[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function varrer() {
    setOcupado(true);
    try {
      const compras = await listarCompras();
      const regras = await listarRegras();
      const porItem = await categoriasPorItem();
      const itensPorCompra = new Map<string, string[]>();
      for (const compra of compras) {
        const itens = await listarItens(compra.id);
        if (itens.length > 0) itensPorCompra.set(compra.id, itens.map((i) => i.nome));
      }

      setPropostas(
        propostasDeRevisao(
          compras,
          { regras, historico: resumirHistorico(compras), porItem },
          itensPorCompra,
        ),
      );
    } finally {
      setOcupado(false);
    }
  }

  async function aceitar(proposta: Proposta) {
    await atualizarCompra(proposta.compraId, { categoria: proposta.para });
    setPropostas((atuais) => (atuais ?? []).filter((p) => p.compraId !== proposta.compraId));
    await onPronto();
  }

  return (
    <>
      <button type="button" className="botao botao-largo" disabled={ocupado} onClick={() => void varrer()}>
        {ocupado ? 'Procurando…' : 'Revisar compras sem categoria'}
      </button>

      {propostas !== null && propostas.length === 0 && (
        <p className="dica">Nenhuma compra em “Outros” com palpite confiável.</p>
      )}

      {propostas !== null && propostas.length > 0 && (
        <>
          <p className="dica">
            {propostas.length} sugestão(ões). Nada muda até você aceitar.
          </p>
          <ul className="lista">
            {propostas.map((proposta) => (
              <li key={proposta.compraId}>
                <div className="item-linha">
                  <div className="item-corpo">
                    <div className="item-nome">
                      {proposta.descricao} → {proposta.para}
                    </div>
                    <div className="item-meta">
                      {formatarData(proposta.data)} · {formatarReais(proposta.total)} ·{' '}
                      {proposta.motivo}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="botao"
                    onClick={() => void aceitar(proposta)}
                  >
                    Aceitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
