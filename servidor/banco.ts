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

/**
 * O banco esta atras do codigo — falta tabela ou coluna que o esquema ja tem?
 *
 * Sao os dois unicos SQLSTATE que significam isso: `42P01` (undefined_table) e
 * `42703` (undefined_column). Os dois drivers do projeto expoem `.code` assim, o
 * Neon e o PGlite, entao a mesma deteccao vale em producao e no teste.
 *
 * A lista e curta de proposito. Qualquer outra falha de banco — conexao, sintaxe,
 * permissao, restricao violada — precisa continuar subindo como erro: mascara-la
 * com uma tentativa de "consertar o esquema" trocaria um problema visivel por um
 * silencioso, que e exatamente o oposto do que este arquivo tenta fazer.
 */
const CODIGOS_DE_ESQUEMA_ATRASADO = new Set(['42P01', '42703']);

export function ehEsquemaDesatualizado(falha: unknown): boolean {
  if (typeof falha !== 'object' || falha === null) return false;
  const codigo = (falha as { code?: unknown }).code;
  return typeof codigo === 'string' && CODIGOS_DE_ESQUEMA_ATRASADO.has(codigo);
}

let esquemaAplicado = false;

/**
 * Aplica `esquema.sql` no banco configurado. Uma vez por processo.
 *
 * Existe porque o passo manual de rodar `npm run banco:criar` depois de publicar
 * FOI esquecido de verdade, e o sintoma foi 500 em toda sincronizacao — o app
 * seguia funcionando no aparelho e nada subia. Como todo comando do esquema e
 * idempotente, aplicar sozinho quando o banco esta atrasado nao custa nada e
 * tira essa classe de falha do caminho.
 *
 * A flag impede insistir: se o esquema ja foi aplicado e o erro continua, o
 * problema e outro e precisa aparecer, nao ser repetido em silencio.
 *
 * O caminho do arquivo e relativo a ESTE modulo, entao funciona tanto sob `tsx`
 * quanto no bundle de `dist-servidor/`, que fica um nivel abaixo da raiz.
 */
export async function aplicarEsquema(): Promise<boolean> {
  if (esquemaAplicado) return false;
  esquemaAplicado = true;

  const { readFile } = await import('node:fs/promises');
  const consultar = await banco();
  const esquema = await readFile(new URL('../esquema.sql', import.meta.url), 'utf8');
  for (const comando of comandosDoEsquema(esquema)) await consultar(comando);
  return true;
}

/** So para o teste conseguir exercitar a autocura mais de uma vez. */
export function esquecerEsquemaAplicado(): void {
  esquemaAplicado = false;
}

/** BIGINT chega como string; timestamps e centavos precisam voltar a ser numero. */
export function numero(valor: unknown): number {
  return typeof valor === 'number' ? valor : Number(valor);
}

/** Igual, mas preservando o `null` da lapide. */
export function numeroOuNulo(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : numero(valor);
}
