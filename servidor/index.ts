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
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { EnvioSincronizacao } from '../compartilhado/tipos';
import { limitesDo, planoValido, type Plano } from '../compartilhado/planos';
import { banco, comandosDoEsquema, ehBancoLocal, ehEsquemaDesatualizado } from './banco';
import {
  analisarMes,
  comentarOrcamento,
  IaDesligada,
  iaLigada,
  modeloDaIa,
  proporRegras,
} from './dicas';
import {
  abrirSessao,
  conferirConfiguracao,
  conferirSenha,
  exigirSessao,
  fecharSessao,
  modoAberto,
  temSessao,
} from './sessao';
import {
  consumirCotaDeIa,
  esperaDoLogin,
  limiteDiarioDaIa,
  limparFalhasDeLogin,
  origemDaRequisicao,
  registrarFalhaDeLogin,
} from './limites';
import { sincronizar } from './sincronizacao';

carregarAmbiente();

const app = new Hono();

/**
 * Cabecalhos de seguranca (nosniff, HSTS, frame, referrer...), SEM CSP: o
 * `index.html` tem um script inline que aplica o tema antes do primeiro quadro, e
 * uma CSP que o proibisse faria a tela piscar no tema errado.
 */
app.use('*', secureHeaders());

/**
 * Teto de tamanho do corpo, em JSON como o resto da API (invariante 8). Sem ele,
 * qualquer um mandava centenas de MB para uma rota que le o corpo ANTES de
 * conferir a senha, e o servidor gratuito (512 MB) cairia. So a sincronizacao
 * carrega lote de verdade, e ela pode ser grande: uma restauracao de backup.
 */
const corpoPequeno = bodyLimit({
  maxSize: 64 * 1024,
  onError: (c) => c.json({ erro: 'Corpo grande demais.' }, 413),
});
const corpoDoSync = bodyLimit({
  maxSize: 10 * 1024 * 1024,
  onError: (c) => c.json({ erro: 'Lote grande demais.' }, 413),
});
app.use('/api/*', (c, proximo) =>
  c.req.path === '/api/sync' ? corpoDoSync(c, proximo) : corpoPequeno(c, proximo),
);

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

/**
 * O que as rotas de sessao devolvem, num lugar so para nao divergirem.
 *
 * `modeloIa` vai junto para a tela de Ajustes mostrar qual modelo esta valendo:
 * ele e trocado no painel do servidor, e sem isso nao ha como conferir a troca.
 */
function estadoDaSessao(autenticado: boolean) {
  return { autenticado, iaLigada: iaLigada(), plano: planoAtual(), modeloIa: modeloDaIa() };
}

app.get('/api/sessao', (c) => c.json(estadoDaSessao(temSessao(c))));

app.post('/api/sessao', async (c) => {
  if (modoAberto()) {
    return c.json(estadoDaSessao(true));
  }

  // O freio vem ANTES de calcular o hash: errar a senha muitas vezes nao pode
  // custar CPU ao servidor nem deixar adivinhar em paralelo.
  const origem = origemDaRequisicao(c);
  const espera = esperaDoLogin(origem);
  if (espera > 0) {
    c.header('Retry-After', String(espera));
    return c.json(
      { erro: `Muitas tentativas. Tente de novo em ${Math.ceil(espera / 60)} min.` },
      429,
    );
  }

  const corpo = await c.req.json<{ senha?: unknown }>().catch(() => ({ senha: '' }));
  const guardado = process.env.SENHA_HASH?.trim() ?? '';
  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';

  if (!senha || !(await conferirSenha(senha, guardado))) {
    registrarFalhaDeLogin(origem);
    // Atraso curto e fixo, alem do freio acima: o freio limita quantas vezes,
    // o atraso torna cada tentativa desagradavel.
    await new Promise((pronto) => setTimeout(pronto, 400));
    return c.json({ erro: 'Senha incorreta.' }, 401);
  }

  limparFalhasDeLogin(origem);
  abrirSessao(c);
  return c.json(estadoDaSessao(true));
});

app.delete('/api/sessao', (c) => {
  fecharSessao(c);
  return c.json({ ok: true });
});

app.post('/api/sync', exigirSessao, async (c) => {
  const envio = await c.req.json<EnvioSincronizacao>().catch(() => null);
  if (!envio || typeof envio !== 'object') return c.json({ erro: 'Corpo inválido.' }, 400);
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
  if (!limitesDo(planoAtual()).ia) {
    return c.json(
      { erro: 'As análises de IA fazem parte do plano pago.', plano: planoAtual() },
      402,
    );
  }

  // Alem do plano, um teto de chamadas por dia: cookie vazado ou um laco no
  // cliente nao pode virar uma conta aberta. 429 e o codigo certo: "voce pode,
  // mas ja usou o que cabe hoje".
  if (iaLigada() && !consumirCotaDeIa()) {
    return c.json(
      {
        erro: `O limite de ${limiteDiarioDaIa()} análises por dia foi atingido. Volte amanhã.`,
      },
      429,
    );
  }
  return null;
}

app.post('/api/dicas', exigirSessao, async (c) => {
  const barrado = exigirPlanoPago(c);
  if (barrado) return barrado;

  const corpo = await c.req.json<{ mes?: string }>().catch(() => null);
  const mes = corpo?.mes;
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

/**
 * O parecer da IA sobre a proposta de orcamento anual.
 *
 * O corpo carrega as linhas porque o rascunho pode ainda nao ter sido
 * sincronizado; o historico e a renda o servidor le do banco. Corpo invalido e
 * 400, e nao 500: o erro e de quem chamou.
 */
app.post('/api/orcamento/parecer', exigirSessao, async (c) => {
  const barrado = exigirPlanoPago(c);
  if (barrado) return barrado;

  const corpo = await c.req.json<{ ano?: unknown; linhas?: unknown }>().catch(() => null);
  if (!corpo) return c.json({ erro: 'Corpo inválido.' }, 400);

  try {
    return c.json(await comentarOrcamento({ ano: corpo.ano, linhas: corpo.linhas }));
  } catch (falha) {
    if (falha instanceof IaDesligada) return c.json({ erro: falha.message }, 503);
    const mensagem = falha instanceof Error ? falha.message : 'Falha ao comentar o orçamento.';
    const invalido = /inválid|Informe de 1/.test(mensagem);
    return c.json({ erro: mensagem }, invalido ? 400 : 500);
  }
});

// Qualquer /api/* que nao casou acima e erro em JSON, nunca HTML: o cliente
// trata resposta nao-JSON como sessao expirada e mandaria voce logar de novo
// por causa de um simples 404.
app.all('/api/*', (c) => c.json({ erro: 'Rota não encontrada.' }, 404));

/**
 * Erro nao previsto tambem sai em JSON — a invariante vale inclusive aqui.
 *
 * O padrao do Hono e `c.text("Internal Server Error", 500)`, texto puro. Foi
 * exatamente esse buraco que transformou "o esquema do banco esta atrasado" em
 * "O servidor respondeu 500." na tela, sem pista nenhuma de onde olhar. A falha
 * inteira vai para o `console.error`, que e o que aparece no log do Render.
 */
app.onError((falha, c) => {
  console.error('Erro nao tratado em ' + c.req.path + ':', falha);

  if (!c.req.path.startsWith('/api/')) {
    return c.text('Erro interno no servidor.', 500);
  }

  const mensagem = ehEsquemaDesatualizado(falha)
    ? 'O esquema do banco está desatualizado. Rode "npm run banco:criar" apontando para ele.'
    : 'Erro interno no servidor. Veja o log para o detalhe.';

  return c.json({ erro: mensagem }, 500);
});

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
  console.log(
    `Dicas de IA: ${iaLigada() ? `ligadas, modelo ${modeloDaIa()} (variavel MODELO_IA)` : 'desligadas (sem ANTHROPIC_API_KEY)'}`,
  );
}

subir().catch((falha: unknown) => {
  console.error('Não foi possível subir o servidor:');
  console.error(falha instanceof Error ? falha.message : falha);
  process.exit(1);
});
