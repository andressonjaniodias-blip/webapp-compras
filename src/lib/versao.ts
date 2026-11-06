/**
 * "Tem versao nova": registra o service worker e avisa quando ha atualizacao.
 *
 * Antes o PWA atualizava SOZINHO (`autoUpdate`): ao achar versao nova ele recarregava
 * a pagina no meio do que a pessoa estava fazendo, e um formulario de item meio
 * digitado, ou uma compra em lancamento no corredor do mercado, ia embora. Agora o
 * app so avisa, e quem decide o momento de atualizar e a pessoa.
 *
 * O aviso e um evento da janela, e nao um estado daqui, porque o registro acontece
 * antes de o React existir (em `main.tsx`) e a tela que mostra o aviso monta depois.
 */

import { registerSW } from 'virtual:pwa-register';

export const EVENTO_NOVA_VERSAO = 'nova-versao-disponivel';

let atualizar: ((recarregar?: boolean) => Promise<void>) | null = null;
let haVersaoNova = false;

export function registrarServiceWorker(): void {
  atualizar = registerSW({
    onNeedRefresh() {
      haVersaoNova = true;
      window.dispatchEvent(new Event(EVENTO_NOVA_VERSAO));
    },
  });
}

/** O aviso pode montar DEPOIS do evento: quem monta pergunta se ja havia versao nova. */
export function jaHaVersaoNova(): boolean {
  return haVersaoNova;
}

/** Ativa a versao nova e recarrega a pagina. */
export function aplicarNovaVersao(): void {
  void atualizar?.(true);
}
