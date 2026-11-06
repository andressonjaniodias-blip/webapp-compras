/**
 * Os freios do servidor: tentativas de login e uso diario da IA.
 *
 * Existem porque o app e publico na internet com UMA senha, e a IA cobra por
 * chamada. Sem freio, a senha podia ser adivinhada em paralelo e um cookie
 * vazado (ou um laco no cliente) virava conta na Anthropic.
 *
 * Tudo vive em MEMORIA, de proposito: e um app de uma pessoa so, num processo
 * so. Ao reiniciar (deploy, o Render dormindo) os contadores zeram, e isso esta
 * assumido: o freio e contra abuso, nao um livro-caixa. Se um dia houver mais
 * de uma instancia, isto precisa ir para o banco.
 */

import type { Context } from 'hono';

const JANELA_DO_LOGIN_MS = 15 * 60 * 1000;
const FALHAS_POR_ORIGEM = 5;
const FALHAS_NO_TOTAL = 30;

/**
 * Quem esta chamando. Atras do proxy do Render, o ULTIMO endereco de
 * `x-forwarded-for` e o que o proxy viu de verdade; os anteriores o cliente
 * pode ter escrito, e usa-los deixaria o freio ser driblado trocando o cabecalho.
 */
export function origemDaRequisicao(c: Context): string {
  const encaminhado = c.req.header('x-forwarded-for');
  if (!encaminhado) return 'local';
  const partes = encaminhado.split(',').map((p) => p.trim()).filter(Boolean);
  return partes[partes.length - 1] ?? 'local';
}

const falhasDeLogin = new Map<string, number[]>();

function recentes(origem: string, agora: number): number[] {
  const todas = (falhasDeLogin.get(origem) ?? []).filter((t) => agora - t < JANELA_DO_LOGIN_MS);
  if (todas.length === 0) falhasDeLogin.delete(origem);
  else falhasDeLogin.set(origem, todas);
  return todas;
}

/** Quantos segundos faltam para poder tentar de novo, ou `0` se pode. */
export function esperaDoLogin(origem: string, agora = Date.now()): number {
  const daOrigem = recentes(origem, agora);
  const noTotal = [...falhasDeLogin.keys()].reduce((soma, o) => soma + recentes(o, agora).length, 0);

  const bloqueadoPorOrigem = daOrigem.length >= FALHAS_POR_ORIGEM;
  const bloqueadoNoTotal = noTotal >= FALHAS_NO_TOTAL;
  if (!bloqueadoPorOrigem && !bloqueadoNoTotal) return 0;

  const maisAntiga = bloqueadoPorOrigem ? daOrigem[0]! : Math.min(...[...falhasDeLogin.values()].flat());
  return Math.max(1, Math.ceil((maisAntiga + JANELA_DO_LOGIN_MS - agora) / 1000));
}

export function registrarFalhaDeLogin(origem: string, agora = Date.now()): void {
  falhasDeLogin.set(origem, [...recentes(origem, agora), agora]);
}

export function limparFalhasDeLogin(origem: string): void {
  falhasDeLogin.delete(origem);
}

/** So para teste: zera tudo. */
export function zerarLimites(): void {
  falhasDeLogin.clear();
  usoDaIa.dia = '';
  usoDaIa.chamadas = 0;
}

// ---------------------------------------------------------------- IA por dia

const LIMITE_PADRAO_DA_IA = 30;
const usoDaIa = { dia: '', chamadas: 0 };

/** O dia, no fuso do processo (America/Sao_Paulo, ver `ambiente.ts`). */
function chaveDoDia(agora: number): string {
  const d = new Date(agora);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function limiteDiarioDaIa(): number {
  const valor = Number(process.env.LIMITE_IA_DIA?.trim());
  return Number.isInteger(valor) && valor > 0 ? valor : LIMITE_PADRAO_DA_IA;
}

/**
 * Pede uma chamada de IA. `true` = pode, e ja conta; `false` = a cota do dia acabou.
 * Chamado ANTES de falar com a Anthropic, porque e a chamada que custa.
 */
export function consumirCotaDeIa(agora = Date.now()): boolean {
  const hoje = chaveDoDia(agora);
  if (usoDaIa.dia !== hoje) {
    usoDaIa.dia = hoje;
    usoDaIa.chamadas = 0;
  }
  if (usoDaIa.chamadas >= limiteDiarioDaIa()) return false;
  usoDaIa.chamadas += 1;
  return true;
}
