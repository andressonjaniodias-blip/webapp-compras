/**
 * Autenticacao de um app de uma pessoa so.
 *
 * Nao ha cadastro, tabela de usuarios nem recuperacao de senha: existe uma
 * senha, guardada como hash scrypt numa variavel de ambiente, e um cookie
 * assinado que vale por muito tempo — voce entra uma vez por aparelho.
 *
 * Duas escolhas que nao sao economia de codigo, e sim seguranca:
 *
 * - A comparacao usa `timingSafeEqual`. Comparar hash com `===` vaza, pelo
 *   tempo de resposta, quantos bytes iniciais bateram.
 * - O cookie e `HttpOnly`, entao JavaScript nenhum consegue le-lo. Se um dia
 *   algo injetar script na pagina, a sessao nao vai junto.
 *
 * O "modo aberto" (sem senha) existe so para desenvolver com o Postgres local.
 * Ele e amarrado a ausencia de `DATABASE_URL`: assim que houver banco de
 * verdade configurado, o servidor se recusa a subir sem senha, em vez de
 * publicar um app aberto por esquecimento.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { ehBancoLocal } from './banco';

const NOME_COOKIE = 'sessao';
const DURACAO_SEGUNDOS = 180 * 24 * 60 * 60; // 180 dias

/** Sem senha configurada e sem banco de verdade: estamos desenvolvendo. */
export function modoAberto(): boolean {
  return ehBancoLocal() && !process.env.SENHA_HASH?.trim();
}

/**
 * Falha cedo e alto. Chamado na subida: e melhor o deploy quebrar agora do que
 * o app ficar publico sem senha e ninguem perceber.
 */
export function conferirConfiguracao(): void {
  if (modoAberto()) return;

  if (!process.env.SENHA_HASH?.trim()) {
    throw new Error(
      'SENHA_HASH nao esta definida. Gere uma com "npm run senha:hash" e configure no servidor.',
    );
  }
  if (!process.env.SESSAO_SEGREDO?.trim()) {
    throw new Error(
      'SESSAO_SEGREDO nao esta definida. Use qualquer string longa e aleatoria.',
    );
  }
}

/** Gera o valor de SENHA_HASH a partir de uma senha em texto. */
export function gerarHash(senha: string): string {
  const sal = randomBytes(16);
  const derivada = scryptSync(senha.normalize('NFKC'), sal, 64);
  return `scrypt$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

export function conferirSenha(senha: string, guardado: string): boolean {
  const partes = guardado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;

  const sal = Buffer.from(partes[1]!, 'hex');
  const esperado = Buffer.from(partes[2]!, 'hex');
  const derivada = scryptSync(senha.normalize('NFKC'), sal, esperado.length);

  return derivada.length === esperado.length && timingSafeEqual(derivada, esperado);
}

/**
 * Sem SESSAO_SEGREDO em desenvolvimento, um segredo aleatorio por processo
 * resolve: as sessoes morrem a cada reinicio, o que atrapalha pouco e evita um
 * valor fixo no codigo que alguem poderia acabar levando para producao.
 */
const segredoDaVez = randomBytes(32).toString('hex');

function segredo(): string {
  return process.env.SESSAO_SEGREDO?.trim() || segredoDaVez;
}

function assinar(carga: string): string {
  return createHmac('sha256', segredo()).update(carga).digest('hex');
}

function crachaValido(valor: string | undefined): boolean {
  if (!valor) return false;

  const separador = valor.lastIndexOf('.');
  if (separador <= 0) return false;

  const carga = valor.slice(0, separador);
  const assinatura = valor.slice(separador + 1);

  const esperada = Buffer.from(assinar(carga), 'utf8');
  const recebida = Buffer.from(assinatura, 'utf8');
  if (esperada.length !== recebida.length) return false;
  if (!timingSafeEqual(esperada, recebida)) return false;

  const expiraEm = Number(carga);
  return Number.isFinite(expiraEm) && expiraEm > Date.now();
}

export function abrirSessao(c: Context): void {
  const expiraEm = Date.now() + DURACAO_SEGUNDOS * 1000;
  const carga = String(expiraEm);

  setCookie(c, NOME_COOKIE, `${carga}.${assinar(carga)}`, {
    httpOnly: true,
    // Em localhost o cookie nao pode ser Secure, senao o navegador o descarta
    // e o login parece falhar sem dar erro.
    secure: !ehBancoLocal(),
    sameSite: 'Lax',
    path: '/',
    maxAge: DURACAO_SEGUNDOS,
  });
}

export function fecharSessao(c: Context): void {
  deleteCookie(c, NOME_COOKIE, { path: '/' });
}

export function temSessao(c: Context): boolean {
  if (modoAberto()) return true;
  return crachaValido(getCookie(c, NOME_COOKIE));
}

/**
 * Responde 401 com JSON, nunca com redirecionamento para uma pagina de login.
 * O cliente distingue "faça login" de "deu erro" pelo status, e uma resposta em
 * HTML no lugar de JSON quebraria o app com erro de parse.
 */
export const exigirSessao: MiddlewareHandler = async (c, proximo) => {
  if (!temSessao(c)) return c.json({ erro: 'Sessão expirada.' }, 401);
  await proximo();
};
