/**
 * As tres saidas de dados do app, cada uma com um proposito diferente:
 *
 * - .xlsx  uma aba por assunto, ligadas por ID. E registro para consultar no
 *          Excel, com tabela dinamica e PROCV. Nao volta para o app.
 * - .csv   compras e itens em texto puro, para quem so quer abrir rapido.
 * - .json  backup de verdade: sai e volta, com os campos de sincronizacao
 *          intactos.
 *
 * O cuidado que faz o .xlsx valer alguma coisa: valor sai como NUMERO e data
 * sai como DATA, nunca como texto. Planilha com dinheiro em texto nao soma, e o
 * erro so aparece quando voce ja montou a tabela dinamica em cima dela.
 *
 * As abas **Parcelas** e **Previsao** sao as que respondem "quanto falta" e
 * "como fica" fora do app: da para filtrar por mes e mexer nas premissas a mao.
 */

import writeExcelFile from 'write-excel-file/browser';
import {
  banco,
  type CompraLocal,
  type ContaLocal,
  type DividaLocal,
  type ItemLocal,
  type MetaLocal,
  type RegraLocal,
  type RendaLocal,
  type TransferenciaLocal,
} from '../dados/banco';
import { naoExcluido } from '../../compartilhado/tipos';
import { grupoDaCategoria } from '../../compartilhado/constantes';
import {
  acharConta,
  compromissos,
  resumoDoMes,
  todasAsFaturas,
  type DadosFinanceiros,
} from '../../compartilhado/carteira';
import { intervaloDoMes } from '../../compartilhado/fatura';
import { parcelasDaCompra, parcelasDaDivida, vezesDa } from '../../compartilhado/parcelamento';
import { competenciaDaCompra } from '../../compartilhado/parcelamento';
import { projetar } from '../../compartilhado/previsao';
import { mesesComCompras } from './resumo';
import { formatarData } from './datas';

const FORMATO_MOEDA = '#,##0.00';
const FORMATO_DATA = 'dd/mm/yyyy';

/** Centavos viram numero decimal para o Excel poder somar. */
function reais(centavos: number): number {
  return centavos / 100;
}

interface Celula {
  value: string | number | Date | boolean;
  type?: typeof String | typeof Number | typeof Date | typeof Boolean;
  format?: string;
  fontWeight?: 'bold';
}

const texto = (value: string): Celula => ({ value, type: String });
const numero = (value: number): Celula => ({ value, type: Number });
const dinheiro = (centavos: number): Celula => ({
  value: reais(centavos),
  type: Number,
  format: FORMATO_MOEDA,
});
const data = (ms: number): Celula => ({ value: new Date(ms), type: Date, format: FORMATO_DATA });

function cabecalho(titulos: string[]): Celula[] {
  return titulos.map((value) => ({ value, type: String, fontWeight: 'bold' as const }));
}

interface Tudo extends DadosFinanceiros {
  compras: CompraLocal[];
  itens: ItemLocal[];
  contas: ContaLocal[];
  rendas: RendaLocal[];
  dividas: DividaLocal[];
  metas: MetaLocal[];
  transferencias: TransferenciaLocal[];
  regras: RegraLocal[];
}

async function carregarTudo(): Promise<Tudo> {
  const compras = (await banco.compras.toArray()).filter(naoExcluido);
  compras.sort((a, b) => a.data - b.data);

  return {
    compras,
    itens: (await banco.itens.toArray()).filter(naoExcluido),
    contas: (await banco.contas.toArray()).filter(naoExcluido),
    rendas: (await banco.rendas.toArray()).filter(naoExcluido),
    dividas: (await banco.dividas.toArray()).filter(naoExcluido),
    metas: (await banco.metas.toArray()).filter(naoExcluido),
    transferencias: (await banco.transferencias.toArray()).filter(naoExcluido),
    regras: (await banco.regras.toArray()).filter(naoExcluido),
  };
}

export async function exportarExcel(nomeArquivo = 'compras.xlsx'): Promise<void> {
  const tudo = await carregarTudo();
  const agora = Date.now();
  const apelido = (id: string | null) => acharConta(tudo.contas, id)?.apelido ?? '';

  const abaCompras: Celula[][] = [
    cabecalho([
      'ID da compra', 'Data', 'Descrição', 'Categoria', 'Grupo', 'Forma de pagamento',
      'Conta', 'Parcelas', 'Valor da parcela', '1ª competência', 'Observação',
      'Qtd. de itens', 'Total',
    ]),
    ...tudo.compras.map((c): Celula[] => {
      const conta = acharConta(tudo.contas, c.contaId);
      const vezes = vezesDa(c);
      const parcelas = parcelasDaCompra(c, conta);
      return [
        texto(c.id),
        data(c.data),
        texto(c.descricao),
        texto(c.categoria),
        texto(grupoDaCategoria(c.categoria)),
        texto(c.formaPagamento),
        texto(apelido(c.contaId)),
        numero(vezes),
        dinheiro(parcelas[0]?.valor ?? c.total),
        texto(conta && conta.tipo === 'credito' ? competenciaDaCompra(c, conta) : ''),
        texto(c.observacao),
        numero(c.qtdItens),
        dinheiro(c.total),
      ];
    }),
  ];

  const porId = new Map(tudo.compras.map((c) => [c.id, c]));

  const abaItens: Celula[][] = [
    cabecalho([
      'ID do item', 'ID da compra', 'Data da compra', 'Item', 'Quantidade', 'Unidade',
      'Preço unitário', 'Total do item',
    ]),
    ...tudo.itens.map((i): Celula[] => {
      const compra = porId.get(i.compraId);
      return [
        texto(i.id),
        texto(i.compraId),
        compra ? data(compra.data) : texto(''),
        texto(i.nome),
        numero(i.quantidade),
        texto(i.unidade),
        dinheiro(i.precoUnitario),
        dinheiro(i.total),
      ];
    }),
  ];

  const abaContas: Celula[][] = [
    cabecalho([
      'ID', 'Apelido', 'Tipo', 'Fecha dia', 'Vence dia', 'Limite', 'Saldo informado',
      'Informado em',
    ]),
    ...tudo.contas.map((c): Celula[] => [
      texto(c.id),
      texto(c.apelido),
      texto(c.tipo),
      c.tipo === 'credito' ? numero(c.diaFechamento) : texto(''),
      c.tipo === 'credito' ? numero(c.diaVencimento) : texto(''),
      c.limite > 0 ? dinheiro(c.limite) : texto(''),
      c.tipo === 'credito' ? texto('') : dinheiro(c.saldoInicial),
      c.tipo === 'credito' ? texto('') : data(c.saldoInicialEm),
    ]),
  ];

  const abaRendas: Celula[][] = [
    cabecalho(['ID', 'Data', 'Origem', 'Descrição', 'Valor', 'Frequência', 'Encerrada em', 'Cai em']),
    ...tudo.rendas.map((r): Celula[] => [
      texto(r.id),
      data(r.data),
      texto(r.origem),
      texto(r.descricao),
      dinheiro(r.valor),
      texto(r.periodicidade),
      r.encerradoEm === null ? texto('') : data(r.encerradoEm),
      texto(apelido(r.contaId)),
    ]),
  ];

  const faltaPorId = new Map(compromissos(tudo, agora).map((c) => [c.id, c.falta]));

  const abaDividas: Celula[][] = [
    cabecalho([
      'ID', 'Descrição', 'Tipo', 'Total a pagar', 'Parcelas', 'Primeira em', 'Pago', 'Falta',
      'Última competência', 'Observação',
    ]),
    ...tudo.dividas.map((d): Celula[] => {
      const falta = faltaPorId.get(d.id);
      return [
        texto(d.id),
        texto(d.descricao),
        texto(d.tipo),
        dinheiro(d.valorTotal),
        numero(d.parcelas),
        data(d.primeiraEm),
        dinheiro(falta?.pago ?? 0),
        dinheiro(falta?.restante ?? d.valorTotal),
        texto(falta?.ultima ?? ''),
        texto(d.observacao),
      ];
    }),
  ];

  const abaMetas: Celula[][] = [
    cabecalho(['ID', 'Meta', 'Alvo', 'Guardado', 'Falta', 'Reserva mensal', 'Prazo']),
    ...tudo.metas.map((m): Celula[] => [
      texto(m.id),
      texto(m.descricao),
      dinheiro(m.valorAlvo),
      dinheiro(m.guardado),
      dinheiro(Math.max(0, m.valorAlvo - m.guardado)),
      dinheiro(m.reservaMensal),
      m.prazoEm === null ? texto('') : data(m.prazoEm),
    ]),
  ];

  // Toda parcela, de cartao e de divida. E a aba que responde "quanto falta"
  // fora do app: filtre por competencia e veja o peso de cada mes futuro.
  const parcelas = [
    ...tudo.compras.flatMap((c) => parcelasDaCompra(c, acharConta(tudo.contas, c.contaId))),
    ...tudo.dividas.flatMap(parcelasDaDivida),
  ].sort((a, b) => a.vencimentoEm - b.vencimentoEm);

  const abaParcelas: Celula[][] = [
    cabecalho([
      'Origem', 'De onde', 'Descrição', 'Parcela', 'De', 'Competência', 'Vencimento', 'Valor',
      'Situação',
    ]),
    ...parcelas.map((p): Celula[] => [
      texto(p.origem === 'cartao' ? 'cartão' : 'dívida'),
      texto(
        p.origem === 'cartao'
          ? apelido(p.origemId)
          : (tudo.dividas.find((d) => d.id === p.origemId)?.descricao ?? ''),
      ),
      texto(p.descricao),
      numero(p.indice),
      numero(p.de),
      texto(p.competencia),
      data(p.vencimentoEm),
      dinheiro(p.valor),
      texto(p.vencimentoEm < agora ? 'vencida' : 'a vencer'),
    ]),
  ];

  const abaFaturas: Celula[][] = [
    cabecalho([
      'Cartão', 'Competência', 'Fechamento', 'Vencimento', 'Total', 'Pago', 'Restante',
      'Situação',
    ]),
    ...todasAsFaturas(tudo, agora).map((f): Celula[] => [
      texto(f.apelido),
      texto(f.competencia),
      data(f.fechamentoEm),
      data(f.vencimentoEm),
      dinheiro(f.total),
      dinheiro(f.pago),
      dinheiro(f.restante),
      texto(f.situacao),
    ]),
  ];

  const abaTransferencias: Celula[][] = [
    cabecalho(['Data', 'Sai de', 'Para', 'Alvo', 'Competência', 'Valor', 'Observação']),
    ...tudo.transferencias
      .slice()
      .sort((a, b) => a.data - b.data)
      .map((t): Celula[] => [
        data(t.data),
        texto(apelido(t.origemContaId)),
        texto(t.alvo),
        texto(
          t.alvo === 'divida'
            ? (tudo.dividas.find((d) => d.id === t.alvoId)?.descricao ?? '')
            : apelido(t.alvoId),
        ),
        texto(t.competencia),
        dinheiro(t.valor),
        texto(t.observacao),
      ]),
  ];

  const previsao = projetar(tudo, { meses: 12, agora });

  const abaPrevisao: Celula[][] = [
    cabecalho([
      'Mês', 'Entradas previstas', 'Comprometido', 'Reserva de metas', 'Gasto estimado',
      'Sobra prevista', 'Saldo ao fim',
    ]),
    ...previsao.map((l): Celula[] => [
      texto(l.mes + (l.parcial ? ' (parcial)' : '')),
      dinheiro(l.entradas),
      dinheiro(l.comprometido),
      dinheiro(l.reservaMetas),
      dinheiro(l.estimado),
      dinheiro(l.sobra),
      dinheiro(l.saldoAcumulado),
    ]),
  ];

  const abaRegras: Celula[][] = [
    cabecalho(['Termo na descrição', 'Categoria']),
    ...tudo.regras.map((r): Celula[] => [texto(r.termo), texto(r.categoria)]),
  ];

  const abaResumo: Celula[][] = [
    cabecalho([
      'Mês', 'Entradas', 'Saiu do caixa', 'No crédito', 'No vale', 'Pago em faturas',
      'A vencer', 'Sobra', 'Adiado em parcelas',
    ]),
    ...mesesComCompras(tudo.compras)
      .slice()
      .reverse()
      .map((mes): Celula[] => {
        const m = resumoDoMes(tudo, mes, agora);
        const { inicio } = intervaloDoMes(mes);
        return [
          { value: new Date(inicio), type: Date, format: 'mm/yyyy' },
          dinheiro(m.entradas),
          dinheiro(m.saidasAVista),
          dinheiro(m.noCredito),
          dinheiro(m.noVale),
          dinheiro(m.pagamentos),
          dinheiro(m.aVencer),
          dinheiro(m.sobra),
          dinheiro(m.adiadoEmParcelas),
        ];
      }),
  ];

  await writeExcelFile(
    [
      { data: abaCompras, sheet: 'Compras', stickyRowsCount: 1 },
      { data: abaItens, sheet: 'Itens', stickyRowsCount: 1 },
      { data: abaContas, sheet: 'Contas', stickyRowsCount: 1 },
      { data: abaRendas, sheet: 'Entradas', stickyRowsCount: 1 },
      { data: abaDividas, sheet: 'Empréstimos', stickyRowsCount: 1 },
      { data: abaMetas, sheet: 'Metas', stickyRowsCount: 1 },
      { data: abaParcelas, sheet: 'Parcelas', stickyRowsCount: 1 },
      { data: abaFaturas, sheet: 'Faturas', stickyRowsCount: 1 },
      { data: abaTransferencias, sheet: 'Transferências', stickyRowsCount: 1 },
      { data: abaPrevisao, sheet: 'Previsão', stickyRowsCount: 1 },
      { data: abaRegras, sheet: 'Regras', stickyRowsCount: 1 },
      { data: abaResumo, sheet: 'Resumo mensal', stickyRowsCount: 1 },
    ],
  ).toFile(nomeArquivo);
}

/** Uma linha de CSV com ponto e virgula, que e o que o Excel pt-BR espera. */
function linhaCsv(valores: (string | number)[]): string {
  return valores
    .map((v) =>
      typeof v === 'number'
        ? String(v).replace('.', ',')
        : '"' + String(v).replace(/"/g, '""') + '"',
    )
    .join(';');
}

export async function exportarCsv(nomeArquivo = 'compras.csv'): Promise<void> {
  const tudo = await carregarTudo();
  const apelido = (id: string | null) => acharConta(tudo.contas, id)?.apelido ?? '';

  const linhas = [
    linhaCsv([
      'ID da compra', 'Data', 'Descrição', 'Categoria', 'Forma de pagamento', 'Conta',
      'Parcelas', 'Item', 'Quantidade', 'Unidade', 'Preço unitário', 'Total',
    ]),
  ];

  for (const compra of tudo.compras) {
    const seus = tudo.itens
      .filter((i) => i.compraId === compra.id)
      .sort((a, b) => a.ordem - b.ordem);

    const comum = [
      compra.id,
      formatarData(compra.data),
      compra.descricao,
      compra.categoria,
      compra.formaPagamento,
      apelido(compra.contaId),
      vezesDa(compra),
    ];

    if (seus.length === 0) {
      linhas.push(linhaCsv([...comum, '(sem itens)', '', '', '', reais(compra.total)]));
      continue;
    }

    for (const item of seus) {
      linhas.push(
        linhaCsv([
          ...comum,
          item.nome,
          item.quantidade,
          item.unidade,
          reais(item.precoUnitario),
          reais(item.total),
        ]),
      );
    }
  }

  // O BOM (﻿) faz o Excel do Windows abrir a acentuacao corretamente. Sem
  // ele, "Farmácia" chega como "FarmÃ¡cia" e o arquivo parece corrompido.
  baixar(
    new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
    nomeArquivo,
  );
}

export interface Backup {
  formato: 'webapp-compras';
  versao: 1 | 2;
  exportadoEm: number;
  compras: CompraLocal[];
  itens: ItemLocal[];
  contas?: ContaLocal[];
  rendas?: RendaLocal[];
  dividas?: DividaLocal[];
  metas?: MetaLocal[];
  transferencias?: TransferenciaLocal[];
  regras?: RegraLocal[];
}

/**
 * Backup completo, inclusive registros na lapide.
 *
 * As lapides vao de proposito: restaurar um backup sem elas ressuscitaria toda
 * compra ja excluida, e na sincronizacao seguinte elas voltariam para os outros
 * aparelhos tambem.
 */
export async function exportarBackup(nomeArquivo = 'backup-compras.json'): Promise<void> {
  const backup: Backup = {
    formato: 'webapp-compras',
    versao: 2,
    exportadoEm: Date.now(),
    compras: await banco.compras.toArray(),
    itens: await banco.itens.toArray(),
    contas: await banco.contas.toArray(),
    rendas: await banco.rendas.toArray(),
    dividas: await banco.dividas.toArray(),
    metas: await banco.metas.toArray(),
    transferencias: await banco.transferencias.toArray(),
    regras: await banco.regras.toArray(),
  };

  baixar(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), nomeArquivo);
}

/**
 * Restaura um backup. Os registros voltam marcados como pendentes para que a
 * proxima sincronizacao os reenvie — do contrario o aparelho ficaria com dados
 * que a nuvem nunca veria.
 *
 * Aceita a versao 1 (so compras e itens) e a 2. Recusar um backup v1 faria os
 * arquivos que o usuario ja salvou virarem lixo — e um backup que nao volta nao
 * e backup.
 */
export async function importarBackup(texto: string): Promise<{ compras: number; itens: number }> {
  const dados = JSON.parse(texto) as Partial<Backup>;

  if (
    dados.formato !== 'webapp-compras' ||
    !Array.isArray(dados.compras) ||
    !Array.isArray(dados.itens)
  ) {
    throw new Error('Este arquivo não é um backup do webapp-compras.');
  }

  const pendente = <T extends object>(lista: T[] | undefined) =>
    (lista ?? []).map((registro) => ({ ...registro, pendente: 1 as const }));

  const compras = dados.compras.map((c) => ({ ...c, pendente: 1 as const }));
  const itens = dados.itens.map((i) => ({ ...i, pendente: 1 as const }));

  await banco.transaction(
    'rw',
    [banco.compras, banco.itens, banco.contas, banco.rendas, banco.dividas, banco.metas,
     banco.transferencias, banco.regras],
    async () => {
      await banco.compras.bulkPut(compras);
      await banco.itens.bulkPut(itens);
      await banco.contas.bulkPut(pendente(dados.contas));
      await banco.rendas.bulkPut(pendente(dados.rendas));
      await banco.dividas.bulkPut(pendente(dados.dividas));
      await banco.metas.bulkPut(pendente(dados.metas));
      await banco.transferencias.bulkPut(pendente(dados.transferencias));
      await banco.regras.bulkPut(pendente(dados.regras));
    },
  );

  return { compras: compras.length, itens: itens.length };
}

function baixar(conteudo: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
