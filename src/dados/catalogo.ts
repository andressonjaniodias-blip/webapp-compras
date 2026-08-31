/**
 * O que faz voce digitar menos com o carrinho na mao.
 *
 * Toda vez que um item e salvo, o nome dele entra num catalogo local com a
 * unidade, o ultimo preco e quantas vezes ja foi comprado. Depois, digitar
 * "arr" basta para trazer "Arroz branco 5kg — R$ 24,90 · 12/07" e preencher o
 * formulario inteiro num toque.
 *
 * Mostrar o preco junto da sugestao e de proposito: e a forma mais barata de
 * perceber que algo subiu — acontece na hora, na prateleira, sem gastar uma
 * chamada de IA. Por isso o catalogo guarda tambem o preco ANTERIOR: sem ele,
 * "R$ 24,90" nao dizia se era caro ou barato, e o proposito do campo nao se
 * cumpria.
 *
 * Guarda tambem a categoria de cada item, que e o que permite os itens votarem
 * na categoria da compra (ver `compartilhado/categorizacao.ts`).
 */

import { banco, type EntradaCatalogo, type ItemLocal } from './banco';
import { normalizarNome } from '../../compartilhado/tipos';
import { casaTermo, ordenarSugestoes } from '../../compartilhado/sugestoes';

/** Registra (ou atualiza) um item no catalogo. Chamado a cada item salvo. */
export async function registrarNoCatalogo(item: {
  nome: string;
  unidade: string;
  precoUnitario: number;
  quantidade: number;
  data: number;
  categoria: string;
}): Promise<void> {
  const chave = normalizarNome(item.nome);
  if (!chave) return;

  const atual = await banco.catalogo.get(chave);

  // So sobrescreve preco e unidade se esta compra for mais recente que a ultima
  // registrada. Sem isso, lançar uma compra antiga esquecida rebaixaria o preco
  // "atual" de um item para o valor de meses atras.
  const maisRecente = atual === undefined || item.data >= atual.ultimaCompraEm;

  // O preco anterior so muda quando o preco de fato muda. Salvar o mesmo item
  // duas vezes com o mesmo preco nao pode zerar a comparacao.
  const precoAnterior =
    maisRecente && atual !== undefined && atual.ultimoPreco !== item.precoUnitario
      ? atual.ultimoPreco
      : (atual?.precoAnterior ?? 0);

  const entrada: EntradaCatalogo = {
    chave,
    nome: maisRecente ? item.nome.trim() : atual.nome,
    unidade: maisRecente ? item.unidade : atual.unidade,
    ultimoPreco: maisRecente ? item.precoUnitario : atual.ultimoPreco,
    precoAnterior,
    ultimaQuantidade: maisRecente ? item.quantidade : atual.ultimaQuantidade,
    ultimaCompraEm: maisRecente ? item.data : atual.ultimaCompraEm,
    ultimaCategoria: maisRecente ? item.categoria : (atual.ultimaCategoria ?? ''),
    vezes: (atual?.vezes ?? 0) + 1,
  };

  await banco.catalogo.put(entrada);
}

/**
 * Sugestoes para o que esta sendo digitado. Com o campo vazio, devolve o que
 * voce mais compra — o atalho de um toque para o item recorrente.
 *
 * A busca e a ordenacao vivem em `compartilhado/sugestoes.ts`, onde da para
 * testa-las sem navegador. Aqui fica so o acesso ao banco.
 */
export async function sugerir(
  termo: string,
  limite = 6,
  categoriaAtual?: string,
): Promise<EntradaCatalogo[]> {
  const alvo = normalizarNome(termo);
  const todos = await banco.catalogo.toArray();
  const candidatos = alvo ? todos.filter((e) => casaTermo(e.chave, alvo)) : todos;
  return ordenarSugestoes(candidatos, alvo, Date.now(), categoriaAtual).slice(0, limite);
}

/** Nome normalizado -> categoria em que o item costuma ser comprado. */
export async function categoriasPorItem(): Promise<Map<string, string>> {
  const todos = await banco.catalogo.toArray();
  const mapa = new Map<string, string>();
  for (const entrada of todos) {
    if (entrada.ultimaCategoria) mapa.set(entrada.chave, entrada.ultimaCategoria);
  }
  return mapa;
}

/**
 * Reconstroi o catalogo inteiro a partir dos itens.
 *
 * Necessario depois de puxar dados da nuvem: os itens que chegaram de outro
 * aparelho precisam entrar nas sugestoes deste. Como o catalogo e derivado,
 * refazer do zero e mais simples e mais confiavel que tentar aplicar delta — e e
 * tambem o que preenche os campos novos (preco anterior, categoria) sem precisar
 * de migracao nenhuma.
 */
export async function reconstruirCatalogo(): Promise<void> {
  const itens = await banco.itens.toArray();
  const compras = await banco.compras.toArray();
  const porCompra = new Map(compras.map((c) => [c.id, c]));

  const mapa = new Map<string, EntradaCatalogo>();

  const ordenados = itens
    .filter((i: ItemLocal) => i.excluidoEm === null && i.nome.trim() !== '')
    .map((i) => ({ item: i, compra: porCompra.get(i.compraId) }))
    .map(({ item, compra }) => ({
      item,
      data: compra?.data ?? item.atualizadoEm,
      categoria: compra?.categoria ?? '',
    }))
    .sort((a, b) => a.data - b.data); // do mais antigo para o mais novo

  for (const { item, data, categoria } of ordenados) {
    const chave = normalizarNome(item.nome);
    if (!chave) continue;
    const anterior = mapa.get(chave);
    mapa.set(chave, {
      chave,
      nome: item.nome.trim(),
      unidade: item.unidade,
      ultimoPreco: item.precoUnitario,
      precoAnterior:
        anterior !== undefined && anterior.ultimoPreco !== item.precoUnitario
          ? anterior.ultimoPreco
          : (anterior?.precoAnterior ?? 0),
      ultimaQuantidade: item.quantidade,
      ultimaCompraEm: data,
      ultimaCategoria: categoria,
      vezes: (anterior?.vezes ?? 0) + 1,
    });
  }

  await banco.transaction('rw', banco.catalogo, async () => {
    await banco.catalogo.clear();
    await banco.catalogo.bulkPut([...mapa.values()]);
  });
}
