/**
 * A outra porta de entrada do banco local: contas, renda, dividas, metas,
 * transferencias e regras de categoria.
 *
 * Mesmo contrato de `compras.ts`, e pelo mesmo motivo: toda escrita carimba
 * `atualizadoEm` e `pendente = 1`, e excluir grava `excluidoEm` em vez de
 * apagar. Sem a lapide, apagar no celular nao teria como se propagar e o
 * registro voltaria do PC na sincronizacao seguinte.
 *
 * As preferencias no fim do arquivo ficam na tabela `config`, que NAO
 * sincroniza: sao gosto de aparelho, nao dado. O celular pode estar em modo
 * simples e o PC completo, e isso e util de proposito.
 */

import {
  banco,
  carimbo,
  gravarConfig,
  lerConfig,
  type ContaLocal,
  type DividaLocal,
  type MetaLocal,
  type RegraLocal,
  type RendaLocal,
  type TransferenciaLocal,
} from './banco';
import { MODO_PADRAO, type ModoCategorizacao } from '../../compartilhado/categorizacao';
import { materializarRenda } from '../../compartilhado/carteira';
import { chaveDoMes, intervaloDoMes } from '../../compartilhado/fatura';
import {
  naoExcluido,
  normalizarNome,
  novoUuid,
  type Conta,
  type Divida,
  type Meta,
  type RegraCategoria,
  type Renda,
  type Transferencia,
} from '../../compartilhado/tipos';

const novo = { excluidoEm: null, versao: 0 } as const;

// ------------------------------------------------------------------ contas

export async function listarContas(): Promise<ContaLocal[]> {
  const todas = await banco.contas.toArray();
  return todas.filter(naoExcluido).sort((a, b) => a.ordem - b.ordem);
}

export async function buscarConta(id: string): Promise<ContaLocal | undefined> {
  const conta = await banco.contas.get(id);
  return conta && naoExcluido(conta) ? conta : undefined;
}

export async function criarConta(parcial: Partial<Conta> = {}): Promise<string> {
  const existentes = await banco.contas.toArray();
  const proximaOrdem = existentes.reduce((maior, c) => Math.max(maior, c.ordem), -1) + 1;

  const conta: ContaLocal = {
    id: novoUuid(),
    apelido: parcial.apelido ?? '',
    tipo: parcial.tipo ?? 'corrente',
    diaFechamento: parcial.diaFechamento ?? 1,
    diaVencimento: parcial.diaVencimento ?? 10,
    limite: parcial.limite ?? 0,
    saldoInicial: parcial.saldoInicial ?? 0,
    // O primeiro dia do mes corrente, e nao `Date.now()`: o saldo de partida
    // marca DE QUANDO ele vale, e comecar "agora" jogava para fora do saldo o
    // salario que ja caiu neste mes — inclusive entradas cadastradas minutos
    // antes. Ver `reinformarSaldo`.
    saldoInicialEm: parcial.saldoInicialEm ?? intervaloDoMes(chaveDoMes(Date.now())).inicio,
    ordem: parcial.ordem ?? proximaOrdem,
    ...novo,
    ...carimbo(),
  };

  await banco.contas.add(conta);
  return conta.id;
}

export async function atualizarConta(
  id: string,
  mudancas: Partial<Omit<Conta, 'id'>>,
): Promise<void> {
  await banco.contas.update(id, { ...mudancas, ...carimbo() });
}

/**
 * Reinforma o saldo de uma conta.
 *
 * Grava o valor E a data juntos, sempre: e a data que faz a leitura se
 * autocorrigir, porque tudo anterior a ela passa a ser ignorado. Gravar so o
 * valor deixaria o saldo somando de novo movimentos que ja estavam embutidos
 * nele — e o numero ficaria errado sem nenhum sinal.
 *
 * `quando` NAO tem valor padrao, e a falta dele e proposital. Enquanto ele caia
 * em `Date.now()` sozinho, digitar o saldo empurrava o corte para o instante do
 * toque e engolia em silencio tudo que tinha sido cadastrado minutos antes.
 * Obrigar quem chama a dizer a data torna esse acidente impossivel de repetir.
 */
export async function reinformarSaldo(id: string, saldo: number, quando: number): Promise<void> {
  await atualizarConta(id, { saldoInicial: saldo, saldoInicialEm: quando });
}

export async function excluirConta(id: string): Promise<void> {
  await banco.contas.update(id, { excluidoEm: Date.now(), ...carimbo() });
}

// ------------------------------------------------------------------ rendas

export async function listarRendas(): Promise<RendaLocal[]> {
  const todas = await banco.rendas.toArray();
  return todas.filter(naoExcluido).sort((a, b) => b.data - a.data);
}

export async function criarRenda(parcial: Partial<Renda> = {}): Promise<string> {
  const renda: RendaLocal = {
    id: novoUuid(),
    data: parcial.data ?? Date.now(),
    descricao: parcial.descricao ?? '',
    origem: parcial.origem ?? '',
    valor: parcial.valor ?? 0,
    // Entrada e LANCAMENTO: nao existe mais regra recorrente. As duas colunas
    // continuam sendo gravadas, e sempre assim, porque o servidor e os
    // aparelhos antigos ainda as leem.
    periodicidade: 'unica',
    encerradoEm: null,
    contaId: parcial.contaId ?? null,
    ...novo,
    ...carimbo(),
  };

  await banco.rendas.add(renda);
  return renda.id;
}

export async function atualizarRenda(
  id: string,
  mudancas: Partial<Omit<Renda, 'id'>>,
): Promise<void> {
  await banco.rendas.update(id, { ...mudancas, ...carimbo() });
}

export async function excluirRenda(id: string): Promise<void> {
  await banco.rendas.update(id, { excluidoEm: Date.now(), ...carimbo() });
}

/**
 * Transforma as entradas RECORRENTES que ainda existem em lancamentos unicos.
 *
 * A recorrencia foi abandonada: entrada e o que caiu, na data em que caiu. Mas
 * ha regras ("salario, todo dia 5") gravadas no aparelho e na nuvem, e apaga-las
 * levaria meses de salario do saldo e do Resumo. Entao cada regra vira uma
 * entrada unica por data que ja caiu (ver `materializarRenda`), e a regra recebe
 * a lapide — na MESMA transacao, porque a regra viva ao lado de suas filhas
 * contaria a primeira data duas vezes.
 *
 * E IDEMPOTENTE e roda de novo na abertura, apos cada sincronizacao e apos
 * importar um backup: regra legada pode chegar de aparelho atrasado ou de arquivo
 * antigo. Sem regra legada, nao faz nada. Os ids das filhas sao deterministicos,
 * entao dois aparelhos que migram a mesma regra geram as mesmas linhas e a nuvem
 * as funde; filha que ja existe nao e tocada, para a migracao nunca passar por
 * cima de um valor que voce corrigiu em outro aparelho.
 *
 * Fica aqui, e nao num `upgrade` do Dexie, porque as filhas precisam do
 * `carimbo()` (invariante 5) — registro reescrito sem carimbo nunca sobe — e
 * porque o `upgrade` roda uma vez, antes do primeiro pull.
 *
 * Devolve quantas regras foram transformadas.
 */
export async function materializarRendasRecorrentes(agora: number = Date.now()): Promise<number> {
  return banco.transaction('rw', banco.rendas, async () => {
    const todas = await banco.rendas.toArray();
    const legadas = todas.filter((r) => naoExcluido(r) && r.periodicidade !== 'unica');

    let transformadas = 0;
    for (const regra of legadas) {
      const filhas = materializarRenda(regra, agora);
      // Regra cuja primeira data ainda e futura espera: nao ha o que lancar.
      if (filhas.length === 0) continue;

      for (const filha of filhas) {
        if (await banco.rendas.get(filha.id)) continue;
        await banco.rendas.add({ ...filha, ...novo, ...carimbo() });
      }
      await banco.rendas.update(regra.id, { excluidoEm: Date.now(), ...carimbo() });
      transformadas += 1;
    }
    return transformadas;
  });
}

// ----------------------------------------------------------------- dividas

export async function listarDividas(): Promise<DividaLocal[]> {
  const todas = await banco.dividas.toArray();
  return todas.filter(naoExcluido).sort((a, b) => a.primeiraEm - b.primeiraEm);
}

export async function criarDivida(parcial: Partial<Divida> = {}): Promise<string> {
  const divida: DividaLocal = {
    id: novoUuid(),
    descricao: parcial.descricao ?? '',
    tipo: parcial.tipo ?? 'emprestimo',
    valorTotal: parcial.valorTotal ?? 0,
    parcelas: parcial.parcelas ?? 1,
    primeiraEm: parcial.primeiraEm ?? Date.now(),
    descontoEmFolha: parcial.descontoEmFolha ?? false,
    contaId: parcial.contaId ?? null,
    observacao: parcial.observacao ?? '',
    ...novo,
    ...carimbo(),
  };

  await banco.dividas.add(divida);
  return divida.id;
}

export async function atualizarDivida(
  id: string,
  mudancas: Partial<Omit<Divida, 'id'>>,
): Promise<void> {
  await banco.dividas.update(id, { ...mudancas, ...carimbo() });
}

export async function excluirDivida(id: string): Promise<void> {
  await banco.dividas.update(id, { excluidoEm: Date.now(), ...carimbo() });
}

// ------------------------------------------------------------------- metas

export async function listarMetas(): Promise<MetaLocal[]> {
  const todas = await banco.metas.toArray();
  return todas.filter(naoExcluido).sort((a, b) => a.ordem - b.ordem);
}

export async function criarMeta(parcial: Partial<Meta> = {}): Promise<string> {
  const existentes = await banco.metas.toArray();
  const proximaOrdem = existentes.reduce((maior, m) => Math.max(maior, m.ordem), -1) + 1;

  const meta: MetaLocal = {
    id: novoUuid(),
    descricao: parcial.descricao ?? '',
    valorAlvo: parcial.valorAlvo ?? 0,
    guardado: parcial.guardado ?? 0,
    reservaMensal: parcial.reservaMensal ?? 0,
    prazoEm: parcial.prazoEm ?? null,
    ordem: parcial.ordem ?? proximaOrdem,
    ...novo,
    ...carimbo(),
  };

  await banco.metas.add(meta);
  return meta.id;
}

export async function atualizarMeta(
  id: string,
  mudancas: Partial<Omit<Meta, 'id'>>,
): Promise<void> {
  await banco.metas.update(id, { ...mudancas, ...carimbo() });
}

export async function excluirMeta(id: string): Promise<void> {
  await banco.metas.update(id, { excluidoEm: Date.now(), ...carimbo() });
}

// --------------------------------------------------------- transferencias

export async function listarTransferencias(): Promise<TransferenciaLocal[]> {
  const todas = await banco.transferencias.toArray();
  return todas.filter(naoExcluido).sort((a, b) => b.data - a.data);
}

/**
 * Registra dinheiro mudando de bolso.
 *
 * E o registro que impede a contagem dupla: como ele aponta para um alvo e uma
 * competencia, o app sabe que aquele dinheiro ja foi contado como gasto quando a
 * compra foi lançada. Sem o vinculo, pagar a fatura pareceria gastar de novo.
 */
export async function registrarTransferencia(
  parcial: Partial<Transferencia> & { origemContaId: string; valor: number },
): Promise<string> {
  const transferencia: TransferenciaLocal = {
    id: novoUuid(),
    origemContaId: parcial.origemContaId,
    alvo: parcial.alvo ?? 'cartao',
    alvoId: parcial.alvoId ?? '',
    competencia: parcial.competencia ?? '',
    data: parcial.data ?? Date.now(),
    valor: parcial.valor,
    observacao: parcial.observacao ?? '',
    ...novo,
    ...carimbo(),
  };

  await banco.transferencias.add(transferencia);
  return transferencia.id;
}

export async function atualizarTransferencia(
  id: string,
  mudancas: Partial<Omit<Transferencia, 'id'>>,
): Promise<void> {
  await banco.transferencias.update(id, { ...mudancas, ...carimbo() });
}

export async function excluirTransferencia(id: string): Promise<void> {
  await banco.transferencias.update(id, { excluidoEm: Date.now(), ...carimbo() });
}

// ------------------------------------------------------------------ regras

export async function listarRegras(): Promise<RegraLocal[]> {
  const todas = await banco.regras.toArray();
  return todas.filter(naoExcluido).sort((a, b) => a.ordem - b.ordem);
}

export async function criarRegra(termo: string, categoria: string): Promise<string | null> {
  const chave = normalizarNome(termo);
  if (!chave || !categoria) return null;

  const existentes = await banco.regras.toArray();
  const repetida = existentes.find((r) => naoExcluido(r) && r.termo === chave);
  if (repetida) {
    await banco.regras.update(repetida.id, { categoria, ...carimbo() });
    return repetida.id;
  }

  const proximaOrdem = existentes.reduce((maior, r) => Math.max(maior, r.ordem), -1) + 1;
  const regra: RegraLocal = {
    id: novoUuid(),
    termo: chave,
    categoria,
    ordem: proximaOrdem,
    ...novo,
    ...carimbo(),
  };

  await banco.regras.add(regra);
  return regra.id;
}

export async function atualizarRegra(
  id: string,
  mudancas: Partial<Omit<RegraCategoria, 'id'>>,
): Promise<void> {
  await banco.regras.update(id, { ...mudancas, ...carimbo() });
}

export async function excluirRegra(id: string): Promise<void> {
  await banco.regras.update(id, { excluidoEm: Date.now(), ...carimbo() });
}

// ------------------------------------------------------------ preferencias

const CHAVE_MODO_SIMPLES = 'modoSimples';
const CHAVE_MODO_CATEGORIA = 'modoCategorizacao';
const CHAVE_GASTO_MANUAL = 'gastoEstimadoManual';
const CHAVE_ENTRADA_MANUAL = 'entradaEstimadaManual';

/**
 * Esconde tudo que e financeiro, independentemente do que exista cadastrado.
 *
 * NAO apaga nada: e so a tela. E preferencia de aparelho porque o celular pode
 * querer ser um caderninho enquanto o PC mostra a previsao inteira.
 */
export function lerModoSimples(): Promise<boolean> {
  return lerConfig<boolean>(CHAVE_MODO_SIMPLES, false);
}

export function gravarModoSimples(ligado: boolean): Promise<void> {
  return gravarConfig(CHAVE_MODO_SIMPLES, ligado);
}

export function lerModoCategorizacao(): Promise<ModoCategorizacao> {
  return lerConfig<ModoCategorizacao>(CHAVE_MODO_CATEGORIA, MODO_PADRAO);
}

export function gravarModoCategorizacao(modo: ModoCategorizacao): Promise<void> {
  return gravarConfig(CHAVE_MODO_CATEGORIA, modo);
}

/** Gasto corrente digitado a mao, em centavos. `null` = usar a media calculada. */
export function lerGastoManual(): Promise<number | null> {
  return lerConfig<number | null>(CHAVE_GASTO_MANUAL, null);
}

export function gravarGastoManual(centavos: number | null): Promise<void> {
  return gravarConfig(CHAVE_GASTO_MANUAL, centavos);
}

/** Entrada mensal digitada a mao, em centavos. `null` = usar a media calculada. */
export function lerEntradaManual(): Promise<number | null> {
  return lerConfig<number | null>(CHAVE_ENTRADA_MANUAL, null);
}

export function gravarEntradaManual(centavos: number | null): Promise<void> {
  return gravarConfig(CHAVE_ENTRADA_MANUAL, centavos);
}
