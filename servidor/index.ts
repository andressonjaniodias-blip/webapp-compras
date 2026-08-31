/**
 * O servidor inteiro: serve o app e expoe quatro rotas.
 *
 * Ele existe por dois motivos, e so por esses dois: guardar a chave da
 * Anthropic longe do navegador e ser a porta do banco na nuvem. Registrar
 * compra nao passa por aqui — isso acontece no aparelho, no IndexedDB, e
 * continua funcionando com o servidor dormindo, caido ou inexistente.
 *
 * Por isso a rota `/api/saude` nao toca no banco: ela serve para acordar o
 * servidor (ou para um ping externo mante-lo acordado) sem tirar o Postgres da
 * suspensao, que e o que consome a cota gratuita.
 */

import { readFile } from 'node:fs/promises';
import { carregarAmbiente } from './ambiente';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import type { EnvioSincronizacao } from '../compartilhado/tipos';
import { limitesDo, planoValido, type Plano } from '../compartilhado/planos';
import { banco, comandosDoEsquema, ehBancoLocal } from './banco';
import { analisarMes, IaDesligada, iaLigada, proporRegras } from './dicas';
import {
  abrirSessao,
  conferirConfiguracao,
  conferirSenha,
  exigirSessao,
  fecharSessao,
  modoAberto,
  temSessao,
} from './sessao';
import { sincronizar } from './sincronizacao';

carregarAmbiente();

const app = new Hono();

/**
 * O plano do usuario.
 *
 * Hoje vem de variavel de ambiente, sem cobrança nenhuma implementada: e a
 * costura onde a cobrança encaixa quando existirem contas de usuario. Quando
 * isso acontecer, isto vira uma coluna e nenhuma tela precisa mudar.
 *
 * A unica coisa que este valor barra DE VERDADE e a IA, la embaixo, porque e a
 * unica que custa dinheiro por uso. O resto dos limites e porteira de tela, e
 * isso esta assumido por escrito em `compartilhado/planos.ts`.
 */
function planoAtual(): Plano {
  return planoValido(process.env.PLANO?.trim());
}

app.get('/api/saude', (c) => c.json({ ok: true, acordadoEm: Date.now() }));

app.get('/api/sessao', (c) =>
  c.json({ autenticado: temSessao(c), iaLigada: iaLigada(), plano: planoAtual() }),
);

app.post('/api/sessao', async (c) => {
  if (modoAberto()) {
    return c.json({ autenticado: true, iaLigada: iaLigada(), plano: planoAtual() });
  }

  const corpo = await c.req.json<{ senha?: string }>().catch(() => ({ senha: '' }));
  const guardado = process.env.SENHA_HASH?.trim() ?? '';

  if (!corpo.senha || !conferirSenha(corpo.senha, guardado)) {
    // Atraso curto e fixo. Nao e defesa forte, mas torna tentativa por forca
    // bruta desagradavel sem precisar guardar estado de tentativas.
    await new Promise((pronto) => setTimeout(pronto, 400));
    return c.json({ erro: 'Senha incorreta.' }, 401);
  }

  abrirSessao(c);
  return c.json({ autenticado: true, iaLigada: iaLigada(), plano: planoAtual() });
});

app.delete('/api/sessao', (c) => {
  fecharSessao(c);
  return c.json({ ok: true });
});

app.post('/api/sync', exigirSessao, async (c) => {
  const envio = await c.req.json<EnvioSincronizacao>();
  const resposta = await sincronizar(envio);
  return c.json(resposta);
});

/**
 * A UNICA trava de plano que precisa ser real.
 *
 * A previsao, o simulador e as metas custam zero para servir — o calculo roda no
 * aparelho. A analise da Anthropic custa por chamada, e por isso e ela que e
 * barrada aqui, antes de qualquer requisicao a API. 402 e o codigo certo:
 * "existe, mas exige pagamento".
 */
function exigirPlanoPago(c: Context) {
  if (limitesDo(planoAtual()).ia) return null;
  return c.json(
    { erro: 'As análises de IA fazem parte do plano pago.', plano: planoAtual() },
    402,
  );
}

app.post('/api/dicas', exigirSessao, async (c) => {
  const barrado = exigirPlanoPago(c);
  if (barrado) return barrado;

  const { mes } = await c.req.json<{ mes?: string }>();
  if (!mes) return c.json({ erro: 'Informe o mês.' }, 400);

  try {
    return c.json(await analisarMes(mes));
  } catch (falha) {
    if (falha instanceof IaDesligada) return c.json({ erro: falha.message }, 503);
    const mensagem = falha instanceof Error ? falha.message : 'Falha ao analisar o mês.';
    return c.json({ erro: mensagem }, 500);
  }
});

/**
 * A IA propoe REGRAS de categoria, e nao a categoria de cada compra.
 *
 * Categorizar lançamento a lançamento custaria uma chamada de API por compra e
 * nao funcionaria offline. Aqui ela le o historico uma vez e devolve regras que
 * o usuario revisa: uma chamada, beneficio permanente, e o resultado continua
 * valendo sem internet depois.
 */
app.post('/api/regras', exigirSessao, async (c) => {
  const barrado = exigirPlanoPago(c);
  if (barrado) return barrado;

  try {
    return c.json({ regras: await proporRegras() });
  } catch (falha) {
    if (falha instanceof IaDesligada) return c.json({ erro: falha.message }, 503);
    const mensagem = falha instanceof Error ? falha.message : 'Falha ao propor regras.';
    return c.json({ erro: mensagem }, 500);
  }
});

// Qualquer /api/* que nao casou acima e erro em JSON, nunca HTML: o cliente
// trata resposta nao-JSON como sessao expirada e mandaria voce logar de novo
// por causa de um simples 404.
app.all('/api/*', (c) => c.json({ erro: 'Rota não encontrada.' }, 404));

app.use('/*', serveStatic({ root: './dist' }));

// O app usa rota por hash (#/compra/abc), entao o servidor so ve "/". Este
// fallback cobre quem digitou um caminho a mais na barra de enderecos.
app.get('*', async (c) => {
  try {
    return c.html(await readFile('./dist/index.html', 'utf8'));
  } catch {
    return c.text('O app ainda não foi construído. Rode: npm run build', 500);
  }
});

async function subir(): Promise<void> {
  conferirConfiguracao();

  if (ehBancoLocal()) {
    // Postgres local: aplica o esquema sozinho para que "npm run dev" funcione
    // sem nenhum passo manual. Todos os comandos sao IF NOT EXISTS.
    const consultar = await banco();
    const esquema = await readFile(new URL('../esquema.sql', import.meta.url), 'utf8');
    for (const comando of comandosDoEsquema(esquema)) await consultar(comando);
    console.log('Banco local em .dados/postgres (sem DATABASE_URL configurada).');
    if (modoAberto()) console.log('MODO ABERTO: sem senha. Só vale em desenvolvimento.');
  }

  const porta = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port: porta });
  console.log(`Servidor ouvindo em http://localhost:${porta}`);
  console.log(`Plano: ${planoAtual()} (variavel PLANO; sem cobrança implementada)`);
  console.log(`Dicas de IA: ${iaLigada() ? 'ligadas' : 'desligadas (sem ANTHROPIC_API_KEY)'}`);
}

subir().catch((falha: unknown) => {
  console.error('Não foi possível subir o servidor:');
  console.error(falha instanceof Error ? falha.message : falha);
  process.exit(1);
});
