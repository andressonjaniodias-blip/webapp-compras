/**
 * Escolha entre poucas opcoes fixas, como botoes redondos.
 *
 * Prefere-se isto a um `<select>` porque o seletor nativo do celular abre uma
 * roleta que cobre a tela e exige tres toques. Aqui e um toque, e todas as
 * opcoes ficam visiveis.
 *
 * Quando o valor gravado nao esta na lista (a lista mudou depois), ele entra
 * como uma opcao extra em vez de sumir — perder informacao gravada seria pior
 * que uma lista com um item a mais.
 */

interface Props {
  opcoes: readonly string[];
  valor: string;
  onChange: (valor: string) => void;
  desabilitado?: boolean;
  rotulo?: string;
}

export function SeletorChips({ opcoes, valor, onChange, desabilitado, rotulo }: Props) {
  const lista = opcoes.includes(valor) || !valor ? opcoes : [valor, ...opcoes];

  return (
    <div className="chips" role="group" aria-label={rotulo}>
      {lista.map((opcao) => (
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
      ))}
    </div>
  );
}
