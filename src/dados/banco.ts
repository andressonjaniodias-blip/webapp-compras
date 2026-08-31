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
import type {
  Compra,
  Conta,
  Divida,
  Item,
  Meta,
  RegraCategoria,
  Renda,
  Transferencia,
} from '../../compartilhado/tipos';

/** Campos que so existem no aparelho e nunca viajam para o servidor. */
export interface SoLocal {
  /** Versao que o servidor deu a este registro. 0 = nunca sincronizado. */
  versao: number;
  /** 1 = precisa ser enviado. Indexado; ver o comentario no topo do arquivo. */
  pendente: 0 | 1;
}

export type CompraLocal = Compra & SoLocal;
export type ItemLocal = Item & SoLocal;
export type ContaLocal = Conta & SoLocal;
export type RendaLocal = Renda & SoLocal;
export type DividaLocal = Divida & SoLocal;
export type MetaLocal = Meta & SoLocal;
export type TransferenciaLocal = Transferencia & SoLocal;
export type RegraLocal = RegraCategoria & SoLocal;

/**
 * O carimbo que TODA escrita precisa deixar.
 *
 * Mora aqui, e nao dentro de uma das portas de escrita, porque sao duas —
 * `compras.ts` e `financas.ts` — e duas copias divergiriam. Sem o carimbo, o
 * registro existe no aparelho e nunca sobe para a nuvem; o sintoma aparece
 * semanas depois, como "sumiu do PC", sem pista de origem.
 */
export function carimbo(): { atualizadoEm: number; pendente: 1 } {
  return { atualizadoEm: Date.now(), pendente: 1 };
}

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
  /**
   * Centavos do preco da vez ANTERIOR. 0 = so houve uma compra.
   *
   * Existe para a sugestao poder mostrar "▲ R$ 24,90 · era R$ 22,90". O topo
   * deste arquivo sempre disse que mostrar o preco ali serve para perceber que
   * algo subiu — so que sem o preco anterior nao havia como perceber.
   */
  precoAnterior: number;
  ultimaQuantidade: number;
  ultimaCompraEm: number;
  /** Categoria sob a qual este item costuma ser comprado. Alimenta o palpite. */
  ultimaCategoria: string;
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
  contas: EntityTable<ContaLocal, 'id'>;
  rendas: EntityTable<RendaLocal, 'id'>;
  dividas: EntityTable<DividaLocal, 'id'>;
  metas: EntityTable<MetaLocal, 'id'>;
  transferencias: EntityTable<TransferenciaLocal, 'id'>;
  regras: EntityTable<RegraLocal, 'id'>;
  catalogo: EntityTable<EntradaCatalogo, 'chave'>;
  config: EntityTable<Config, 'chave'>;
};

banco.version(1).stores({
  compras: 'id, data, pendente, atualizadoEm',
  itens: 'id, compraId, pendente, nome',
  catalogo: 'chave, vezes, ultimaCompraEm',
  config: 'chave',
});

/**
 * v2: as tabelas do lado financeiro.
 *
 * A `version(1)` acima continua declarada — Dexie precisa dela para migrar quem
 * ja tem o banco. E aditivo: nenhuma tabela antiga muda de forma, e os campos
 * novos de `compras` (contaId, parcelas) nao sao indexados, entao registro
 * antigo continua valido sem funcao de upgrade. Reescrever registro numa
 * migracao os deixaria sem carimbo, e eles nunca subiriam.
 *
 * `pendente` indexado em todas: sem isso `contarPendentes()` nao as ve e a fila
 * de envio fica invisivel, que e o bug descrito no topo do arquivo.
 */
banco.version(2).stores({
  contas: 'id, pendente, ordem',
  rendas: 'id, pendente, data',
  dividas: 'id, pendente',
  metas: 'id, pendente, ordem',
  transferencias: 'id, pendente, alvoId, competencia',
  regras: 'id, pendente, ordem',
});

export async function lerConfig<T>(chave: string, padrao: T): Promise<T> {
  const linha = await banco.config.get(chave);
  return linha === undefined ? padrao : (linha.valor as T);
}

export async function gravarConfig(chave: string, valor: unknown): Promise<void> {
  await banco.config.put({ chave, valor });
}
