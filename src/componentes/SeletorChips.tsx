/**
 * Escolha entre poucas opcoes fixas, como botoes redondos.
 *
 * Prefere-se isto a um `<select>` porque o seletor nativo do celular abre uma
 * roleta que cobre a tela e exige tres toques. Aqui e um toque, e todas as
 * opcoes ficam visiveis.
 *
 * Quando o valor gravado nao esta na lista (a lista mudou depois), ele entra
 * como uma opcao extra em vez de sumir — perder informacao gravada seria pior
 * que uma lista com um item a mais. E o mesmo mecanismo que faz categoria criada
 * pelo usuario existir sem tabela nova: ela nasce porque esta numa compra.
 *
 * Os `destaques` sao as mais usadas por voce, numa primeira fileira. A ordem
 * DENTRO de cada bloco e estavel de proposito: chip que pula de lugar a cada
 * compra destroi a memoria muscular, que e justamente o que faz o lançamento ser
 * rapido no corredor do mercado.
 */

import { useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  opcoes: readonly string[];
  valor: string;
  onChange: (valor: string) => void;
  desabilitado?: boolean;
  rotulo?: string;
  /** As mais usadas, numa fileira propria acima do resto. */
  destaques?: readonly string[];
  /** Mostra o chip "+" para digitar um valor que nao esta na lista. */
  permitirNovo?: boolean;
}

export function SeletorChips({
  opcoes,
  valor,
  onChange,
  desabilitado,
  rotulo,
  destaques = [],
  permitirNovo = false,
}: Props) {
  const [digitando, setDigitando] = useState(false);
  const [texto, setTexto] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  const emDestaque = destaques.filter((opcao) => opcao !== valor && opcoes.includes(opcao));
  const jaMostradas = new Set(emDestaque);
  const naLista = opcoes.filter((opcao) => !jaMostradas.has(opcao));

  /**
   * A ORDEM NAO MUDA quando voce escolhe.
   *
   * O valor gravado so vai para a frente quando ele NAO esta na lista — caso de
   * um valor antigo cuja opcao foi removida, que precisa continuar visivel.
   * Reordenar a cada toque destruiria a memoria muscular, que e justamente o que
   * faz o lançamento ser rapido no corredor do mercado.
   */
  const principais = valor && !opcoes.includes(valor) ? [valor, ...naLista] : naLista;

  function confirmarNovo() {
    const limpo = texto.trim();
    setDigitando(false);
    setTexto('');
    if (limpo) onChange(limpo);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      confirmarNovo();
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      setDigitando(false);
      setTexto('');
    }
  }

  const chip = (opcao: string) => (
    <button
      key={opcao}
      type="button"
      className={'chip' + (opcao === valor ? ' chip-ativo' : '')}
      aria-pressed={opcao === valor}
      disabled={desabilitado}
      onClick={() => onChange(opcao)}
    >
      {opcao}
    </button>
  );

  return (
    <div role="group" aria-label={rotulo}>
      {emDestaque.length > 0 && (
        <div className="chips chips-destaque">{emDestaque.map(chip)}</div>
      )}

      <div className="chips">
        {principais.map(chip)}

        {permitirNovo && !digitando && (
          <button
            type="button"
            className="chip chip-novo"
            disabled={desabilitado}
            aria-label={'Nova opção de ' + (rotulo ?? 'lista')}
            onClick={() => {
              setDigitando(true);
              // O foco so pode ir para o campo depois que ele existe na tela.
              requestAnimationFrame(() => campo.current?.focus());
            }}
          >
            +
          </button>
        )}
      </div>

      {digitando && (
        <input
          ref={campo}
          className="entrada"
          type="text"
          autoComplete="off"
          placeholder="Nome da nova opção"
          aria-label={'Nova opção de ' + (rotulo ?? 'lista')}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          onBlur={confirmarNovo}
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}
