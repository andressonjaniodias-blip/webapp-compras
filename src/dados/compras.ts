/**
 * Uma das DUAS portas de entrada do banco local — a de compras e itens. A outra
 * e `financas.ts`. Nenhuma tela fala com o Dexie direto.
 *
 * O motivo e concreto: toda escrita precisa carimbar `atualizadoEm` e marcar
 * `pendente = 1`, senao o registro nunca sobe para a nuvem. Se cada tela
 * escrevesse por conta propria, bastaria um formulario esquecer o carimbo para
 * a compra existir no celular e sumir do PC — e o sintoma apareceria semanas
 * depois, sem pista de origem. O `carimbo()` vive em `banco.ts` justamente para
 * as duas portas usarem o mesmo.
 *
 * Manter esse contrato num arquivo so tambem e o que vai permitir mexer na
 * sincronizacao sem reescrever tela nenhuma.
 */

import { banco, carimbo, type CompraLocal, type ItemLocal } from './banco';
import { registrarNoCatalogo } from './catalogo';
import {
  calcularTotalCompra,
  naoExcluido,
  novoUuid,
  type Compra,
  type Item,
} from '../../compartilhado/tipos';
import {
  CATEGORIA_PADRAO,
  FORMA_PAGAMENTO_PADRAO,
  UNIDADE_PADRAO,
} from '../../compartilhado/constantes';

export interface ValoresItem {
  nome: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  total: number;
}

// ---------------------------------------------------------------- leitura

/** Compras vivas, da mais recente para a mais antiga. */
export async function listarCompras(): Promise<CompraLocal[]> {
  const todas = await banco.compras.orderBy('data').reverse().toArray();
  return todas.filter(naoExcluido);
}

export async function buscarCompra(id: string): Promise<CompraLocal | undefined> {
  const compra = await banco.compras.get(id);
  return compra && naoExcluido(compra) ? compra : undefined;
}

/** Itens vivos de uma compra, na ordem em que foram lançados. */
export async function listarItens(compraId: string): Promise<ItemLocal[]> {
  const itens = await banco.itens.where('compraId').equals(compraId).toArray();
  return itens.filter(naoExcluido).sort((a, b) => a.ordem - b.ordem);
}

/**
 * Categoria, forma de pagamento e conta da ultima compra, para ja virem
 * preenchidas na proxima. Quem compra no mesmo mercado toda semana nao deveria
 * ter que escolher "Mercado" e "Débito" toda vez.
 *
 * A conta segue a ULTIMA COMPRA COM A MESMA FORMA de pagamento, e nao a ultima
 * compra qualquer: quem pagou no debito ontem e no credito hoje nao quer o
 * cartao sugerido para o Pix de amanha.
 */
export async function preferenciasRecentes(formaPagamento?: string): Promise<{
  categoria: string;
  formaPagamento: string;
  contaId: string | null;
}> {
  const compras = await listarCompras();
  const ultima = compras[0];
  const forma = formaPagamento ?? ultima?.formaPagamento ?? FORMA_PAGAMENTO_PADRAO;
  const comMesmaForma = compras.find((c) => c.formaPagamento === forma && c.contaId);

  return {
    categoria: ultima?.categoria ?? CATEGORIA_PADRAO,
    formaPagamento: forma,
    contaId: comMesmaForma?.contaId ?? null,
  };
}

// ---------------------------------------------------------------- compras

export async function criarCompra(parcial: Partial<Compra> = {}): Promise<string> {
  const preferencias = await preferenciasRecentes();
  const agora = Date.now();

  const compra: CompraLocal = {
    id: novoUuid(),
    data: parcial.data ?? agora,
    descricao: parcial.descricao ?? '',
    categoria: parcial.categoria ?? preferencias.categoria,
    formaPagamento: parcial.formaPagamento ?? preferencias.formaPagamento,
    observacao: parcial.observacao ?? '',
    totalManual: parcial.totalManual ?? 0,
    total: parcial.totalManual ?? 0,
    qtdItens: 0,
    // Sem conta cadastrada isto fica `null` para sempre e a compra funciona
    // igual — o lado financeiro e opcional, e nada aqui pode exigi-lo.
    contaId: parcial.contaId ?? preferencias.contaId,
    parcelas: parcial.parcelas ?? 1,
    excluidoEm: null,
    versao: 0,
    ...carimbo(),
  };

  await banco.compras.add(compra);
  return compra.id;
}

export async function atualizarCompra(
  id: string,
  mudancas: Partial<Omit<Compra, 'id'>>,
): Promise<void> {
  await banco.transaction('rw', banco.compras, banco.itens, async () => {
    await banco.compras.update(id, { ...mudancas, ...carimbo() });
    await recalcular(id);
  });
}

/**
 * Exclusao logica da compra e de todos os seus itens.
 *
 * Apagar de verdade quebraria a sincronizacao: sem a lapide, o outro aparelho
 * nao teria como saber que o registro morreu e o devolveria na proxima rodada,
 * fazendo a compra "ressuscitar" sozinha.
 */
export async function excluirCompra(id: string): Promise<void> {
  const agora = Date.now();
  await banco.transaction('rw', banco.compras, banco.itens, async () => {
    await banco.compras.update(id, { excluidoEm: agora, ...carimbo() });
    const itens = await banco.itens.where('compraId').equals(id).toArray();
    await banco.itens.bulkPut(
      itens.map((item) => ({ ...item, excluidoEm: agora, ...carimbo() })),
    );
  });
}

// ------------------------------------------------------------------ itens

export async function adicionarItem(compraId: string, valores: ValoresItem): Promise<void> {
  const existentes = await banco.itens.where('compraId').equals(compraId).toArray();
  const proximaOrdem = existentes.reduce((maior, i) => Math.max(maior, i.ordem), -1) + 1;

  const item: ItemLocal = {
    id: novoUuid(),
    compraId,
    nome: valores.nome.trim(),
    quantidade: valores.quantidade,
    unidade: valores.unidade || UNIDADE_PADRAO,
    precoUnitario: valores.precoUnitario,
    total: valores.total,
    ordem: proximaOrdem,
    excluidoEm: null,
    versao: 0,
    ...carimbo(),
  };

  await banco.transaction('rw', banco.compras, banco.itens, async () => {
    await banco.itens.add(item);
    await recalcular(compraId);
  });

  await alimentarCatalogo(item);
}

export async function atualizarItem(id: string, valores: ValoresItem): Promise<void> {
  const atual = await banco.itens.get(id);
  if (!atual) return;

  const atualizado: ItemLocal = {
    ...atual,
    nome: valores.nome.trim(),
    quantidade: valores.quantidade,
    unidade: valores.unidade || UNIDADE_PADRAO,
    precoUnitario: valores.precoUnitario,
    total: valores.total,
    ...carimbo(),
  };

  await banco.transaction('rw', banco.compras, banco.itens, async () => {
    await banco.itens.put(atualizado);
    await recalcular(atual.compraId);
  });

  await alimentarCatalogo(atualizado);
}

export async function removerItem(id: string): Promise<void> {
  const item = await banco.itens.get(id);
  if (!item) return;

  await banco.transaction('rw', banco.compras, banco.itens, async () => {
    await banco.itens.update(id, { excluidoEm: Date.now(), ...carimbo() });
    await recalcular(item.compraId);
  });
}

// --------------------------------------------------------------- internos

/**
 * Reescreve `total` e `qtdItens` da compra a partir dos itens vivos.
 *
 * Os dois campos sao denormalizados de proposito: a lista precisa mostrar o
 * total de dezenas de compras e carregar os itens de cada uma so para somar
 * seria lento a toa. O preco disso e ter que recalcular a cada escrita — dai
 * esta funcao rodar dentro da mesma transacao de quem mexeu no item.
 */
async function recalcular(compraId: string): Promise<void> {
  const compra = await banco.compras.get(compraId);
  if (!compra) return;

  const itens = await banco.itens.where('compraId').equals(compraId).toArray();
  const vivos = itens.filter(naoExcluido);

  await banco.compras.update(compraId, {
    total: calcularTotalCompra(compra.totalManual, vivos as Item[]),
    qtdItens: vivos.length,
    ...carimbo(),
  });
}

/**
 * O catalogo precisa da data da compra, nao da hora em que o item foi digitado.
 *
 * Leva junto a categoria: e por ela que os itens conseguem votar na categoria de
 * uma compra futura ("dipirona, band-aid" -> Farmácia).
 */
async function alimentarCatalogo(item: ItemLocal): Promise<void> {
  const compra = await banco.compras.get(item.compraId);
  await registrarNoCatalogo({
    nome: item.nome,
    unidade: item.unidade,
    precoUnitario: item.precoUnitario,
    quantidade: item.quantidade,
    data: compra?.data ?? item.atualizadoEm,
    categoria: compra?.categoria ?? '',
  });
}
