/**
 * O tema do aparelho: seguir o sistema, ou fixar claro ou escuro.
 *
 * A escolha mora no `localStorage`, e nao na tabela `config` onde vivem as
 * outras preferencias de aparelho. O motivo e a ORDEM: o tema tem de estar
 * aplicado antes do primeiro quadro, e o Dexie e assincrono. Lendo de la, quem
 * fixou o claro num aparelho escuro veria a tela piscar escura a cada abertura.
 * Por isso o `index.html` tem um script de tres linhas que le esta mesma chave
 * antes de qualquer coisa ser desenhada — ao mexer na chave, mexa la tambem.
 *
 * Nao e dado, e nao sincroniza: o celular pode ficar escuro enquanto o PC fica
 * claro. Tambem nao entra no backup.
 *
 * O CSS faz o resto. Sem atributo, vale `prefers-color-scheme`; com
 * `data-tema`, vale o atributo. Ver o topo de `src/estilos.css`.
 */

export type Tema = 'automatico' | 'claro' | 'escuro';

const CHAVE = 'tema';

/** Iguais ao `--fundo` de cada tema em `estilos.css`: pintam a barra do sistema. */
const FUNDO = { claro: '#d6d6d2', escuro: '#0a0a0a' } as const;

export function lerTema(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return salvo === 'claro' || salvo === 'escuro' ? salvo : 'automatico';
  } catch {
    // Navegacao privada pode recusar o acesso. Sem escolha salva, segue o aparelho.
    return 'automatico';
  }
}

export function gravarTema(tema: Tema): void {
  try {
    if (tema === 'automatico') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, tema);
  } catch {
    // Sem onde guardar, a escolha vale ate fechar o app.
  }
  aplicarTema(tema);
}

/**
 * Poe a escolha no documento.
 *
 * As duas `<meta name="theme-color">` do `index.html` seguem o sistema pela
 * `media` de cada uma. Com o tema fixado elas passam a dizer a mesma cor, senao
 * a barra do navegador ficaria escura sobre um app claro.
 */
export function aplicarTema(tema: Tema = lerTema()): void {
  const raiz = document.documentElement;
  if (tema === 'automatico') delete raiz.dataset.tema;
  else raiz.dataset.tema = tema;

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const doSistema = meta.media.includes('dark') ? FUNDO.escuro : FUNDO.claro;
    meta.content = tema === 'automatico' ? doSistema : FUNDO[tema];
  }
}
