/**
 * O banco que roda dentro do aparelho (IndexedDB, via Dexie).
 *
 * Ele e a fonte imediata da verdade: registrar uma compra no corredor do
 * mercado nao depende de sinal, de servidor acordado nem de login valido. A
 * nuvem e backup e ponte entre celular e PC — nunca o caminho critico.
 *
 * Sobre `pendente` ser 0/1 e nao um booleano ou `sincronizadoEm: null`:
 * o IndexedDB **nao indexa `null`, `undefined` nem booleano**. Um registro com
 * `sincronizadoEm: null` simplesmente sumiria do indice, e a fila de envio
 * ficaria invisivel — um bug que so apareceria depois, como "algumas compras
 * nunca sobem". Inteiro indexavel evita a armadilha inteira.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Compra, Item } from '../../compartilhado/tipos';

/** Campos que so existem no aparelho e nunca viajam para o servidor. */
export interface SoLocal {
  /** Versao que o servidor deu a este registro. 0 = nunca sincronizado. */
  versao: number;
  /** 1 = precisa ser enviado. Indexado; ver o comentario no topo do arquivo. */
  pendente: 0 | 1;
}

export type CompraLocal = Compra & SoLocal;
export type ItemLocal = Item & SoLocal;

/**
 * Cache derivado dos itens, usado so para sugerir enquanto voce digita.
 *
 * Nao sincroniza de proposito: da para reconstruir inteiro a partir da tabela
 * de itens, entao mandar isso pela rede seria pagar banda por algo que cada
 * aparelho calcula sozinho em milissegundos.
 */
export interface EntradaCatalogo {
  /** Nome normalizado (minusculo, sem acento). E a chave primaria. */
  chave: string;
  /** O nome como voce escreveu da ultima vez. */
  nome: string;
  unidade: string;
  /** Centavos do preco unitario da ultima compra deste item. */
  ultimoPreco: number;
  ultimaQuantidade: number;
  ultimaCompraEm: number;
  vezes: number;
}

/** Chave/valor para o que nao merece tabela propria (cursor da sincronizacao). */
export interface Config {
  chave: string;
  valor: unknown;
}

export const banco = new Dexie('webapp-compras') as Dexie & {
  compras: EntityTable<CompraLocal, 'id'>;
  itens: EntityTable<ItemLocal, 'id'>;
  catalogo: EntityTable<EntradaCatalogo, 'chave'>;
  config: EntityTable<Config, 'chave'>;
};

banco.version(1).stores({
  compras: 'id, data, pendente, atualizadoEm',
  itens: 'id, compraId, pendente, nome',
  catalogo: 'chave, vezes, ultimaCompraEm',
  config: 'chave',
});

export async function lerConfig<T>(chave: string, padrao: T): Promise<T> {
  const linha = await banco.config.get(chave);
  return linha === undefined ? padrao : (linha.valor as T);
}

export async function gravarConfig(chave: string, valor: unknown): Promise<void> {
  await banco.config.put({ chave, valor });
}
