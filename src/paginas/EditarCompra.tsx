/**
 * A tela de uma compra: os dados dela em cima, os itens embaixo.
 *
 * A compra e sempre editavel — nao existe "encerrar" nem "reabrir". No mercado
 * voce cria, vai lançando e sai; em casa, se precisar corrigir, corrige. Um
 * estado a menos e uma trava a menos entre voce e o dado certo.
 *
 * O campo de valor total fica inerte quando ha itens, porque ai o total e a
 * soma deles. Essa e a regra que torna o detalhamento opcional: item a item no
 * supermercado, so o total no posto de gasolina.
 *
 * PRINCÍPIO 0: o formulario nao cresce sozinho. Sem conta cadastrada, ele e o de
 * antes da v2. Com contas, os chips de forma de pagamento ganham uma segunda
 * fileira. No credito, aparece UM campo de parcelas, ja preenchido com 1. Nada
 * mais entra aqui, nunca.
 */

import { Carregando } from '../componentes/Carregando';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CampoDinheiro } from '../componentes/CampoDinheiro';
import { CampoNumero } from '../componentes/CampoNumero';
import { FormItem, type ValoresFormItem } from '../componentes/FormItem';
import { JanelaCentral } from '../componentes/JanelaCentral';
import { LinhaItem } from '../componentes/LinhaItem';
import { SeletorChips } from '../componentes/SeletorChips';
import {
  CATEGORIAS,
  CONTAS_POR_FORMA,
  FORMAS_PAGAMENTO,
} from '../../compartilhado/constantes';
import { adivinharCategoria, deveAplicarSozinho, resumirHistorico } from '../../compartilhado/categorizacao';
import { previaDaCompra } from '../../compartilhado/previsao';
import { valorDaParcela } from '../../compartilhado/parcelamento';
import {
  adicionarItem,
  atualizarCompra,
  atualizarItem,
  buscarCompra,
  excluirCompra,
  listarCompras,
  listarItens,
  removerItem,
  restaurarItem,
} from '../dados/compras';
import { useConfirmar } from '../componentes/Confirmar';
import { useDesfazer } from '../componentes/Desfazer';
import { categoriasPorItem } from '../dados/catalogo';
import { lerModoCategorizacao, listarRegras } from '../dados/financas';
import { useFinanceiro } from '../dados/financeiro';
import type { ItemLocal } from '../dados/banco';
import { formatarReais } from '../lib/dinheiro';
import { deInputDataHora, formatarData, nomeMes, paraInputDataHora } from '../lib/datas';
import { useApp } from '../estado';
import { useVoltar } from '../lib/useVoltar';

export function EditarCompra() {
  const { id = '' } = useParams();
  // "‹" e "Concluir" devolvem para ONDE a pessoa estava (a lista de compras, no mesmo
  // mes, ou o painel se a compra nasceu la), e nao sempre para a tela inicial.
  const navegar = useNavigate();
  const voltar = useVoltar('/');
  // Marca a saida por exclusao: sem ela, o `Navigate` abaixo ("a compra sumiu")
  // dispara junto com o voltar e leva para o painel.
  const saindo = useRef(false);
  const { atualizarPendentes } = useApp();
  const confirmar = useConfirmar();
  const oferecerDesfazer = useDesfazer();
  const financeiro = useFinanceiro();

  // `undefined` = carregando; `null` = nao existe (foi excluida).
  const compra = useLiveQuery(async () => (await buscarCompra(id)) ?? null, [id]);
  const itens = useLiveQuery(() => listarItens(id), [id], [] as ItemLocal[]);

  const contexto = useLiveQuery(
    async () => ({
      regras: await listarRegras(),
      // Sem o `id`, a propria compra em edicao entraria no historico e o
      // palpite passaria a confirmar a categoria que ela herdou.
      historico: resumirHistorico(await listarCompras(), id),
      porItem: await categoriasPorItem(),
      modo: await lerModoCategorizacao(),
    }),
    [id],
    undefined,
  );

  const [emEdicao, setEmEdicao] = useState<string | null>(null);
  // Inserir e editar item abrem numa janela no centro da tela, e uma so por vez.
  const [inserindo, setInserindo] = useState(false);
  const [motivoDoPalpite, setMotivoDoPalpite] = useState<string | null>(null);

  /**
   * Encostou nos chips de categoria? Entao o palpite nunca mais mexe nesta
   * compra. E a invariante 4 do projeto aplicada aqui: preenche campo que voce
   * nao tocou, e nunca sobrescreve o que voce escolheu.
   *
   * "NESTA compra" e literal, e por isso o `id` e vigiado logo abaixo: o React
   * Router reaproveita este componente ao trocar de compra, entao sem zerar a
   * marca um unico toque nos chips desligaria a categorizacao automatica de
   * todas as compras seguintes — e ninguem descobriria o porque.
   */
  const categoriaTocada = useRef(false);
  const compraVigiada = useRef(id);

  const descricao = compra?.descricao ?? '';
  const nomesDosItens = itens.map((item) => item.nome);
  const assinaturaDosItens = nomesDosItens.join('|');

  // A cascata roda quando a descricao muda ou um item entra — nunca na simples
  // abertura da tela, para nao reescrever uma escolha feita semanas atras.
  const primeiraPassagem = useRef(true);
  useEffect(() => {
    if (compraVigiada.current !== id) {
      compraVigiada.current = id;
      categoriaTocada.current = false;
      primeiraPassagem.current = true;
      setMotivoDoPalpite(null);
    }
    if (primeiraPassagem.current) {
      primeiraPassagem.current = false;
      return;
    }
    if (!compra || !contexto || contexto.modo === 'desligado' || categoriaTocada.current) return;

    const palpite = adivinharCategoria({
      descricao,
      itens: nomesDosItens,
      regras: contexto.regras,
      historico: contexto.historico,
      porItem: contexto.porItem,
    });

    if (!palpite.categoria || palpite.categoria === compra.categoria) return;
    if (contexto.modo === 'sugerir' || deveAplicarSozinho(palpite, contexto.modo)) {
      void atualizarCompra(id, { categoria: palpite.categoria });
      setMotivoDoPalpite(`${palpite.categoria} — ${palpite.motivo}`);
    }
    // `assinaturaDosItens` entra como dependencia para o palpite reagir a um item
    // novo; a lista em si mudaria de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, descricao, assinaturaDosItens, contexto?.modo]);

  if (compra === undefined) {
    return (
      <div className="app" role="main">
        <Carregando />
      </div>
    );
  }

  if (compra === null) return saindo.current ? null : <Navigate to="/" replace />;

  const temItens = itens.length > 0;
  const itemEmEdicao = itens.find((item) => item.id === emEdicao);
  const vezes = compra.parcelas ?? 1;

  const tiposAceitos = CONTAS_POR_FORMA[compra.formaPagamento] ?? [];
  const contasCompativeis = financeiro.dados.contas.filter((c) => tiposAceitos.includes(c.tipo));
  const contaEscolhida = financeiro.dados.contas.find((c) => c.id === compra.contaId);
  const noCredito = contaEscolhida?.tipo === 'credito';
  const previa = previaDaCompra(compra, financeiro.dados);

  // As cinco categorias que voce mais usa, na primeira fileira.
  const maisUsadas = maisFrequentes(financeiro.dados.compras.map((c) => c.categoria), 5);

  async function mudar(mudancas: Parameters<typeof atualizarCompra>[1]) {
    await atualizarCompra(id, mudancas);
    await atualizarPendentes();
  }

  async function salvarNovoItem(valores: ValoresFormItem) {
    await adicionarItem(id, valores);
    await atualizarPendentes();
  }

  async function apagarCompra() {
    const certeza = await confirmar({
      texto: 'Excluir esta compra e todos os itens dela? Isso some também dos outros aparelhos.',
      rotulo: 'Excluir',
      perigo: true,
    });
    if (!certeza) return;
    saindo.current = true;
    await excluirCompra(id);
    await atualizarPendentes();
    voltar();
  }

  return (
    <div className="app" role="main">
      <header className="topo">
        <div className="topo-linha">
          <button type="button" className="botao-icone" aria-label="Voltar" onClick={voltar}>
            ‹
          </button>
          <h1>Compra</h1>
          <button type="button" className="botao-icone" aria-label="Excluir compra" onClick={apagarCompra}>
            🗑
          </button>
        </div>
      </header>

      <section className="cartao">
        <span className="campo-rotulo">Total</span>
        <div className="total-grande">{formatarReais(compra.total)}</div>
        <p className="dica">
          {temItens
            ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} · somados`
            : 'lançada só com o total, sem itens'}
          {compra.pendente === 1 && ' · ainda não sincronizada'}
        </p>
      </section>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="descricao">Onde foi</label>
        <input
          id="descricao"
          className="entrada"
          type="text"
          autoComplete="off"
          placeholder="Supermercado, posto, farmácia…"
          value={compra.descricao}
          onChange={(e) => void mudar({ descricao: e.target.value })}
        />
      </div>

      <div className="campo">
        <span className="campo-rotulo">Categoria</span>
        <SeletorChips
          opcoes={CATEGORIAS}
          destaques={maisUsadas}
          valor={compra.categoria}
          rotulo="Categoria"
          permitirNovo
          onChange={(categoria) => {
            categoriaTocada.current = true;
            setMotivoDoPalpite(null);
            void mudar({ categoria });
          }}
        />
        {motivoDoPalpite && <p className="dica dica-palpite">{motivoDoPalpite}</p>}
      </div>

      <div className="campo">
        <span className="campo-rotulo">Forma de pagamento</span>
        <SeletorChips
          opcoes={FORMAS_PAGAMENTO}
          valor={compra.formaPagamento}
          rotulo="Forma de pagamento"
          onChange={(formaPagamento) => {
            // Trocar a forma invalida a conta escolhida: Pix nao sai do cartao.
            const aceitos = CONTAS_POR_FORMA[formaPagamento] ?? [];
            const aindaVale =
              contaEscolhida !== undefined && aceitos.includes(contaEscolhida.tipo);
            void mudar({ formaPagamento, contaId: aindaVale ? compra.contaId : null });
          }}
        />
      </div>

      {financeiro.mostrar && contasCompativeis.length > 0 && (
        <div className="campo">
          <span className="campo-rotulo">De qual conta</span>
          <SeletorChips
            opcoes={contasCompativeis.map((c) => c.apelido)}
            valor={contaEscolhida?.apelido ?? ''}
            rotulo="Conta"
            onChange={(apelido) => {
              const escolhida = contasCompativeis.find((c) => c.apelido === apelido);
              void mudar({ contaId: escolhida?.id ?? null });
            }}
          />
        </div>
      )}

      {financeiro.mostrar && contasCompativeis.length === 0 && tiposAceitos.length > 0 && (
        <p className="dica">
          Nenhuma conta de {compra.formaPagamento.toLowerCase()} cadastrada.{' '}
          <button type="button" className="link" onClick={() => navegar('/contas')}>
            Cadastrar
          </button>
        </p>
      )}

      {noCredito && (
        <div className="campo">
          <label className="campo-rotulo" htmlFor="parcelas">Em quantas vezes</label>
          <CampoNumero
            id="parcelas"
            valor={vezes}
            min={1}
            max={48}
            onChange={(parcelas) => void mudar({ parcelas })}
          />
          {previa && (
            <p className="dica">
              {vezes > 1 && (
                <>
                  {vezes}x de {formatarReais(valorDaParcela(compra.total, vezes, 2))} ·{' '}
                </>
              )}
              cai na fatura que vence em {formatarData(previa.primeira.vencimentoEm)} ·{' '}
              {previa.diasAtePagar} dias para pagar
              {vezes > 1 && ` · última em ${nomeMes(previa.ultima.competencia)}`}
            </p>
          )}
        </div>
      )}

      <div className="campo">
        <label className="campo-rotulo" htmlFor="quando">Data e hora</label>
        <input
          id="quando"
          className="entrada"
          type="datetime-local"
          value={paraInputDataHora(compra.data)}
          onChange={(e) => {
            const data = deInputDataHora(e.target.value);
            if (data !== null) void mudar({ data });
          }}
        />
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="valor">
          Valor total {temItens && '(vem da soma dos itens)'}
        </label>
        <CampoDinheiro
          id="valor"
          valor={temItens ? compra.total : compra.totalManual}
          disabled={temItens}
          onChange={(totalManual) => void mudar({ totalManual })}
        />
        {temItens && (
          <p className="dica">Remova todos os itens para voltar a digitar o valor à mão.</p>
        )}
      </div>

      <div className="campo">
        <label className="campo-rotulo" htmlFor="obs">Observação</label>
        <textarea
          id="obs"
          className="entrada"
          placeholder="Qualquer coisa que não cabe nos outros campos"
          value={compra.observacao}
          onChange={(e) => void mudar({ observacao: e.target.value })}
        />
      </div>

      <h2 className="secao-titulo">Itens ({itens.length})</h2>

      {itens.length === 0 && (
        <p className="dica">
          Itens são opcionais. Lance um a um quando quiser acompanhar preço; deixe vazio
          quando só o total interessar.
        </p>
      )}

      <ul className="lista">
        {itens.map((item) => (
          <LinhaItem
            key={item.id}
            item={item}
            onEditar={() => setEmEdicao(item.id)}
            onRemover={async () => {
              await removerItem(item.id);
              await atualizarPendentes();
              oferecerDesfazer(`${item.nome || 'Item'} removido.`, async () => {
                await restaurarItem(item.id);
                await atualizarPendentes();
              });
            }}
          />
        ))}
      </ul>

      {/*
        As duas janelas. A de inserir fica aberta depois de "Adicionar": o
        formulario ja limpa e devolve o foco ao nome, para lançar o carrinho
        inteiro sem reabrir a cada item. "Fechar" encerra.
      */}
      <JanelaCentral aberta={inserindo} onFechar={() => setInserindo(false)} titulo="Novo item">
        <FormItem
          onSalvar={salvarNovoItem}
          categoria={compra.categoria}
          onCancelar={() => setInserindo(false)}
          rotuloCancelar="Fechar"
        />
      </JanelaCentral>

      <JanelaCentral
        aberta={itemEmEdicao !== undefined}
        onFechar={() => setEmEdicao(null)}
        titulo="Editar item"
      >
        {itemEmEdicao && (
          <FormItem
            itemInicial={itemEmEdicao}
            categoria={compra.categoria}
            onCancelar={() => setEmEdicao(null)}
            onSalvar={async (valores) => {
              await atualizarItem(itemEmEdicao.id, valores);
              await atualizarPendentes();
              setEmEdicao(null);
            }}
          />
        )}
      </JanelaCentral>

      <div className="rodape">
        <button type="button" className="botao" onClick={voltar}>
          Concluir
        </button>
        <button type="button" className="botao botao-primario" onClick={() => setInserindo(true)}>
          Adicionar item
        </button>
      </div>
    </div>
  );
}

/** As `quantas` opcoes mais usadas, para virarem a primeira fileira de chips. */
function maisFrequentes(valores: readonly string[], quantas: number): string[] {
  const contagem = new Map<string, number>();
  for (const valor of valores) {
    if (!valor) continue;
    contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, quantas)
    .map(([valor]) => valor);
}
