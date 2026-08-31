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
    saldoInicialEm: parcial.saldoInicialEm ?? Date.now(),
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
 */
export async function reinformarSaldo(id: string, saldo: number, quando = Date.now()): Promise<void> {
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
    periodicidade: parcial.periodicidade ?? 'unica',
    encerradoEm: parcial.encerradoEm ?? null,
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
 * Aumento de salario, sem estragar o historico.
 *
 * Editar o valor no lugar reescreveria o passado: com um aumento em julho,
 * janeiro a junho passariam a valer o valor novo e todo resumo anterior ficaria
 * errado — sem ninguem perceber, porque nada quebra.
 *
 * Entao a renda antiga ganha fim no ultimo instante do mes ANTERIOR ao da
 * mudança, e uma nova começa no primeiro instante do mes da mudança. As duas
 * coisas numa transacao so: se a segunda falhasse sozinha, a renda sumiria do
 * mes que vem sem aviso nenhum.
 */
export async function alterarRendaRecorrente(
  id: string,
  valorNovo: number,
  aPartirDe: number,
): Promise<string | null> {
  const atual = await banco.rendas.get(id);
  if (!atual) return null;

  const mes = chaveDoMes(aPartirDe);
  const { inicio } = intervaloDoMes(mes);
  const fimDaAntiga = inicio - 1;

  // Mudança que começa antes (ou junto) do inicio da renda e correcao, nao
  // aumento: nao ha passado para preservar.
  if (fimDaAntiga < atual.data) {
    await atualizarRenda(id, { valor: valorNovo });
    return null;
  }

  const novoId = novoUuid();
  await banco.transaction('rw', banco.rendas, async () => {
    await banco.rendas.update(id, { encerradoEm: fimDaAntiga, ...carimbo() });
    await banco.rendas.add({
      ...atual,
      id: novoId,
      data: inicio,
      valor: valorNovo,
      encerradoEm: null,
      ...novo,
      ...carimbo(),
    });
  });

  return novoId;
}

/** Correcao de erro de digitacao: muda o valor sem cortar a vigencia. */
export async function corrigirRenda(id: string, valorNovo: number): Promise<void> {
  await atualizarRenda(id, { valor: valorNovo });
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
