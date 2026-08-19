/**
 * As tres saidas de dados do app, cada uma com um proposito diferente:
 *
 * - .xlsx  duas abas ligadas por ID. E registro para consultar no Excel, com
 *          tabela dinamica e PROCV. Nao volta para o app.
 * - .csv   a mesma coisa em texto puro, para quem so quer abrir rapido.
 * - .json  backup de verdade: sai e volta, com os campos de sincronizacao
 *          intactos.
 *
 * O cuidado que faz o .xlsx valer alguma coisa: valor sai como NUMERO e data
 * sai como DATA, nunca como texto. Planilha com dinheiro em texto nao soma, e o
 * erro so aparece quando voce ja montou a tabela dinamica em cima dela.
 */

import writeExcelFile from 'write-excel-file/browser';
import { banco, type CompraLocal, type ItemLocal } from '../dados/banco';
import { naoExcluido } from '../../compartilhado/tipos';
import { formatarData } from './datas';

const FORMATO_MOEDA = '#,##0.00';
const FORMATO_DATA = 'dd/mm/yyyy';

/** Centavos viram numero decimal para o Excel poder somar. */
function reais(centavos: number): number {
  return centavos / 100;
}

interface Celula {
  value: string | number | Date;
  type?: typeof String | typeof Number | typeof Date;
  format?: string;
  fontWeight?: 'bold';
}

function cabecalho(titulos: string[]): Celula[] {
  return titulos.map((value) => ({ value, type: String, fontWeight: 'bold' as const }));
}

async function carregarTudo(): Promise<{ compras: CompraLocal[]; itens: ItemLocal[] }> {
  const compras = (await banco.compras.toArray()).filter(naoExcluido);
  const itens = (await banco.itens.toArray()).filter(naoExcluido);
  compras.sort((a, b) => a.data - b.data);
  return { compras, itens };
}

export async function exportarExcel(nomeArquivo = 'compras.xlsx'): Promise<void> {
  const { compras, itens } = await carregarTudo();

  const abaCompras: Celula[][] = [
    cabecalho([
      'ID da compra',
      'Data',
      'Descrição',
      'Categoria',
      'Forma de pagamento',
      'Observação',
      'Qtd. de itens',
      'Total',
    ]),
    ...compras.map((c): Celula[] => [
      { value: c.id, type: String },
      { value: new Date(c.data), type: Date, format: FORMATO_DATA },
      { value: c.descricao, type: String },
      { value: c.categoria, type: String },
      { value: c.formaPagamento, type: String },
      { value: c.observacao, type: String },
      { value: c.qtdItens, type: Number },
      { value: reais(c.total), type: Number, format: FORMATO_MOEDA },
    ]),
  ];

  const porId = new Map(compras.map((c) => [c.id, c]));

  const abaItens: Celula[][] = [
    cabecalho([
      'ID do item',
      'ID da compra',
      'Data da compra',
      'Item',
      'Quantidade',
      'Unidade',
      'Preço unitário',
      'Total do item',
    ]),
    ...itens.map((i): Celula[] => {
      const compra = porId.get(i.compraId);
      return [
        { value: i.id, type: String },
        { value: i.compraId, type: String },
        compra
          ? { value: new Date(compra.data), type: Date, format: FORMATO_DATA }
          : { value: '', type: String },
        { value: i.nome, type: String },
        { value: i.quantidade, type: Number },
        { value: i.unidade, type: String },
        { value: reais(i.precoUnitario), type: Number, format: FORMATO_MOEDA },
        { value: reais(i.total), type: Number, format: FORMATO_MOEDA },
      ];
    }),
  ];

  await writeExcelFile(
    [
      { data: abaCompras, sheet: 'Compras', stickyRowsCount: 1 },
      { data: abaItens, sheet: 'Itens', stickyRowsCount: 1 },
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
  const { compras, itens } = await carregarTudo();

  const linhas = [
    linhaCsv([
      'ID da compra', 'Data', 'Descrição', 'Categoria', 'Forma de pagamento',
      'Item', 'Quantidade', 'Unidade', 'Preço unitário', 'Total',
    ]),
  ];

  for (const compra of compras) {
    const seus = itens
      .filter((i) => i.compraId === compra.id)
      .sort((a, b) => a.ordem - b.ordem);

    const comum = [
      compra.id,
      formatarData(compra.data),
      compra.descricao,
      compra.categoria,
      compra.formaPagamento,
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
  versao: 1;
  exportadoEm: number;
  compras: CompraLocal[];
  itens: ItemLocal[];
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
    versao: 1,
    exportadoEm: Date.now(),
    compras: await banco.compras.toArray(),
    itens: await banco.itens.toArray(),
  };

  baixar(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), nomeArquivo);
}

/**
 * Restaura um backup. Os registros voltam marcados como pendentes para que a
 * proxima sincronizacao os reenvie — do contrario o aparelho ficaria com dados
 * que a nuvem nunca veria.
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

  const compras = dados.compras.map((c) => ({ ...c, pendente: 1 as const }));
  const itens = dados.itens.map((i) => ({ ...i, pendente: 1 as const }));

  await banco.transaction('rw', banco.compras, banco.itens, async () => {
    await banco.compras.bulkPut(compras);
    await banco.itens.bulkPut(itens);
  });

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
