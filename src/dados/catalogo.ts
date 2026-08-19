/**
 * O que faz voce digitar menos com o carrinho na mao.
 *
 * Toda vez que um item e salvo, o nome dele entra num catalogo local com a
 * unidade, o ultimo preco e quantas vezes ja foi comprado. Depois, digitar
 * "arr" basta para trazer "Arroz branco 5kg — R$ 24,90 · 12/07" e preencher o
 * formulario inteiro num toque.
 *
 * Mostrar o ultimo preco junto da sugestao e de proposito: e a forma mais barata
 * de perceber que algo subiu — acontece na hora, na prateleira, sem gastar uma
 * chamada de IA.
 */

import { banco, type EntradaCatalogo, type ItemLocal } from './banco';
import { normalizarNome } from '../../compartilhado/tipos';

/** Registra (ou atualiza) um item no catalogo. Chamado a cada item salvo. */
export async function registrarNoCatalogo(item: {
  nome: string;
  unidade: string;
  precoUnitario: number;
  quantidade: number;
  data: number;
}): Promise<void> {
  const chave = normalizarNome(item.nome);
  if (!chave) return;

  const atual = await banco.catalogo.get(chave);

  // So sobrescreve preco e unidade se esta compra for mais recente que a ultima
  // registrada. Sem isso, lançar uma compra antiga esquecida rebaixaria o preco
  // "atual" de um item para o valor de meses atras.
  const maisRecente = atual === undefined || item.data >= atual.ultimaCompraEm;

  const entrada: EntradaCatalogo = {
    chave,
    nome: maisRecente ? item.nome.trim() : atual.nome,
    unidade: maisRecente ? item.unidade : atual.unidade,
    ultimoPreco: maisRecente ? item.precoUnitario : atual.ultimoPreco,
    ultimaQuantidade: maisRecente ? item.quantidade : atual.ultimaQuantidade,
    ultimaCompraEm: maisRecente ? item.data : atual.ultimaCompraEm,
    vezes: (atual?.vezes ?? 0) + 1,
  };

  await banco.catalogo.put(entrada);
}

/**
 * Sugestoes para o que esta sendo digitado. Com o campo vazio, devolve o que
 * voce mais compra — o atalho de um toque para o item recorrente.
 *
 * A ordenacao mistura frequencia e recencia: quem comprou mais vezes vem antes,
 * e empate se desfaz pelo mais recente. Um item comprado toda semana tem que
 * estar no topo mesmo que voce tenha lançado outra coisa cinco minutos atras.
 */
export async function sugerir(termo: string, limite = 6): Promise<EntradaCatalogo[]> {
  const alvo = normalizarNome(termo);
  const todos = await banco.catalogo.toArray();

  const candidatos = alvo
    ? todos.filter((e) => e.chave.includes(alvo))
    : todos;

  return candidatos
    .sort((a, b) => {
      // Quem começa com o termo digitado vem antes de quem so o contem.
      if (alvo) {
        const aComeca = a.chave.startsWith(alvo) ? 0 : 1;
        const bComeca = b.chave.startsWith(alvo) ? 0 : 1;
        if (aComeca !== bComeca) return aComeca - bComeca;
      }
      if (b.vezes !== a.vezes) return b.vezes - a.vezes;
      return b.ultimaCompraEm - a.ultimaCompraEm;
    })
    .slice(0, limite);
}

/**
 * Reconstroi o catalogo inteiro a partir dos itens.
 *
 * Necessario depois de puxar dados da nuvem: os itens que chegaram de outro
 * aparelho precisam entrar nas sugestoes deste. Como o catalogo e derivado,
 * refazer do zero e mais simples e mais confiavel que tentar aplicar delta.
 */
export async function reconstruirCatalogo(): Promise<void> {
  const itens = await banco.itens.toArray();
  const compras = await banco.compras.toArray();
  const dataPorCompra = new Map(compras.map((c) => [c.id, c.data]));

  const mapa = new Map<string, EntradaCatalogo>();

  const ordenados = itens
    .filter((i: ItemLocal) => i.excluidoEm === null && i.nome.trim() !== '')
    .map((i) => ({ item: i, data: dataPorCompra.get(i.compraId) ?? i.atualizadoEm }))
    .sort((a, b) => a.data - b.data); // do mais antigo para o mais novo

  for (const { item, data } of ordenados) {
    const chave = normalizarNome(item.nome);
    if (!chave) continue;
    const anterior = mapa.get(chave);
    mapa.set(chave, {
      chave,
      nome: item.nome.trim(),
      unidade: item.unidade,
      ultimoPreco: item.precoUnitario,
      ultimaQuantidade: item.quantidade,
      ultimaCompraEm: data,
      vezes: (anterior?.vezes ?? 0) + 1,
    });
  }

  await banco.transaction('rw', banco.catalogo, async () => {
    await banco.catalogo.clear();
    await banco.catalogo.bulkPut([...mapa.values()]);
  });
}
