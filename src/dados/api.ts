/**
 * Conversa com o servidor. Tudo passa por aqui para que dois cuidados valham
 * em toda chamada, sem depender de quem chamou lembrar deles:
 *
 * 1. Timeout largo (90s). O servidor dorme depois de 15 minutos parado e leva
 *    perto de um minuto para acordar. Isso e o comportamento normal do plano
 *    gratuito, nao uma falha — cortar em 10 segundos transformaria o normal em
 *    erro e a sincronizacao nunca aconteceria.
 * 2. Sessao expirada nao vira erro de parse. Quando o cookie vence, a resposta
 *    pode chegar como HTML de login em vez de JSON. Sem tratar isso, o app
 *    quebraria com "Unexpected token <" — mensagem que nao ajuda ninguem.
 */

const TEMPO_LIMITE = 90_000;

/** Erro que significa "faça login de novo", nao "deu problema". */
export class SemSessao extends Error {
  constructor() {
    super('Sessão expirada.');
    this.name = 'SemSessao';
  }
}

export class FalhaDeRede extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'FalhaDeRede';
  }
}

/**
 * `converter401` existe por causa da tela de senha. Em qualquer rota, 401
 * significa "sua sessao venceu"; na rota de login, significa "essa senha esta
 * errada". Sem essa distincao, digitar a senha errada respondia "Sessão
 * expirada.", que e confuso justamente para quem nunca teve sessao nenhuma.
 */
export async function chamarApi<T>(
  caminho: string,
  opcoes: RequestInit = {},
  converter401 = true,
): Promise<T> {
  let resposta: Response;

  try {
    resposta = await fetch('/api' + caminho, {
      ...opcoes,
      headers: { 'content-type': 'application/json', ...opcoes.headers },
      credentials: 'same-origin',
      signal: AbortSignal.timeout(TEMPO_LIMITE),
    });
  } catch (falha) {
    const motivo =
      falha instanceof Error && falha.name === 'TimeoutError'
        ? 'O servidor demorou demais para responder.'
        : 'Sem conexão com o servidor.';
    throw new FalhaDeRede(motivo);
  }

  if (resposta.status === 401 && converter401) throw new SemSessao();

  // Resposta que nao e JSON quase sempre significa que caimos numa tela de
  // login. Tratar como sessao expirada da ao usuario a acao certa a tomar.
  const tipo = resposta.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) {
    if (!resposta.ok) throw new FalhaDeRede('O servidor respondeu ' + resposta.status + '.');
    throw new SemSessao();
  }

  const corpo = (await resposta.json()) as T & { erro?: string };
  if (!resposta.ok) {
    throw new FalhaDeRede(corpo.erro ?? 'O servidor respondeu ' + resposta.status + '.');
  }
  return corpo;
}

export interface EstadoSessao {
  autenticado: boolean;
  /** Falso quando nao ha chave da Anthropic configurada no servidor. */
  iaLigada: boolean;
}

export function verificarSessao(): Promise<EstadoSessao> {
  return chamarApi<EstadoSessao>('/sessao');
}

export function entrar(senha: string): Promise<EstadoSessao> {
  return chamarApi<EstadoSessao>(
    '/sessao',
    { method: 'POST', body: JSON.stringify({ senha }) },
    false,
  );
}

export function sair(): Promise<{ ok: true }> {
  return chamarApi<{ ok: true }>('/sessao', { method: 'DELETE' });
}

export interface Achado {
  titulo: string;
  detalhe: string;
  economiaEstimadaCentavos: number | null;
}

export interface Dicas {
  resumo: string;
  achados: Achado[];
  sugestoes: string[];
}

export function pedirDicas(mes: string): Promise<Dicas> {
  return chamarApi<Dicas>('/dicas', { method: 'POST', body: JSON.stringify({ mes }) });
}
