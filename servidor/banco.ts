/**
 * Acesso ao Postgres, com dois destinos possiveis atras da mesma funcao.
 *
 * - Com `DATABASE_URL`: Neon, pelo driver HTTP.
 * - Sem `DATABASE_URL`: um Postgres de verdade rodando dentro do processo
 *   (PGlite), gravando em `.dados/`. E o que permite desenvolver e TESTAR a
 *   sincronizacao sem criar conta em lugar nenhum — inclusive rodar o teste
 *   automatizado de dois aparelhos.
 *
 * Por que o driver HTTP e nao um pool de conexoes: o Neon suspende o banco
 * depois de 5 minutos sem uso, e conexao ociosa aberta impede a suspensao. Um
 * pool "bem configurado" manteria o banco acordado 24h por dia e queimaria as
 * 100 horas de compute do plano gratuito em silencio, sem nenhum erro para
 * denunciar o que estava acontecendo.
 *
 * Sobre BIGINT: o Postgres devolve int8 como STRING para nao perder precisao em
 * JavaScript. Timestamps em milissegundos (~1.7e12) cabem folgadamente no
 * inteiro seguro do JS (9e15), entao a conversao acontece no mapeamento de cada
 * linha — nunca deixe um desses chegar cru na resposta, ou o cliente comparara
 * "1755612345678" com 1755612345678 e nunca serao iguais.
 */

export type Consultar = <T = Record<string, unknown>>(
  texto: string,
  parametros?: unknown[],
) => Promise<T[]>;

let cache: Promise<Consultar> | null = null;

async function criar(): Promise<Consultar> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return async <T>(texto: string, parametros: unknown[] = []) =>
      (await sql.query(texto, parametros)) as T[];
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const destino = process.env.PGLITE_DIR ?? '.dados/postgres';

  // O PGlite nao cria diretorio aninhado: sem isto, a primeira execucao morre
  // com ENOENT em vez de criar o banco.
  if (!destino.includes('://')) {
    const { mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(destino), { recursive: true });
  }

  // O caminho e configuravel para os testes poderem rodar num banco em
  // memoria, isolado do banco de desenvolvimento.
  const db = new PGlite(destino);
  await db.waitReady;
  return async <T>(texto: string, parametros: unknown[] = []) =>
    (await db.query<T>(texto, parametros)).rows;
}

/** O banco, criado uma vez por processo. */
export function banco(): Promise<Consultar> {
  cache ??= criar();
  return cache;
}

/** Verdadeiro quando estamos no Postgres local de desenvolvimento. */
export function ehBancoLocal(): boolean {
  return !process.env.DATABASE_URL?.trim();
}

/**
 * Quebra `esquema.sql` nos comandos individuais.
 *
 * Tira os comentarios ANTES de dividir no ponto e virgula. Sem isso, um simples
 * ponto e virgula dentro de um comentario parte o arquivo no lugar errado e o
 * Postgres recebe prosa como se fosse SQL — erro de sintaxe apontando para uma
 * linha que nem e comando. Como o esquema e aplicado na subida do servidor, o
 * estrago seria um deploy que nao sobe por causa de pontuacao.
 */
export function comandosDoEsquema(sql: string): string[] {
  return sql
    .split('\n')
    .filter((linha) => !linha.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((comando) => comando.trim())
    .filter(Boolean);
}

/** BIGINT chega como string; timestamps e centavos precisam voltar a ser numero. */
export function numero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(valor);
}

/** Igual, mas preservando o `null` da lapide. */
export function numeroOuNulo(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : numero(valor);
}
