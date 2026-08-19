/**
 * Campo de dinheiro: por fora fala centavos inteiros, por dentro guarda o texto
 * que esta sendo digitado.
 *
 * A separacao importa porque "12," e um estado valido enquanto voce digita —
 * se o componente reformatasse a cada tecla, a virgula sumiria embaixo do dedo.
 * A normalizacao acontece so ao sair do campo.
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { formatarCentavos, paraCentavos } from '../lib/dinheiro';

interface Props {
  /** Valor em centavos. */
  valor: number;
  onChange: (centavos: number) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function CampoDinheiro({ valor, onChange, id, placeholder, disabled, ...resto }: Props) {
  const [texto, setTexto] = useState(() => (valor ? formatarCentavos(valor) : ''));
  const ultimo = useRef(valor);

  // Ressincroniza quando o valor muda por fora — por exemplo quando escolher
  // uma sugestao preenche o preco, ou quando outro campo recalcula este.
  useEffect(() => {
    if (valor !== ultimo.current) {
      ultimo.current = valor;
      setTexto(valor ? formatarCentavos(valor) : '');
    }
  }, [valor]);

  function aoDigitar(evento: ChangeEvent<HTMLInputElement>) {
    const digitado = evento.target.value;
    setTexto(digitado);
    const centavos = paraCentavos(digitado);
    ultimo.current = centavos;
    onChange(centavos);
  }

  return (
    <input
      {...resto}
      id={id}
      className="entrada"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder ?? '0,00'}
      disabled={disabled}
      value={texto}
      onChange={aoDigitar}
      onBlur={() => setTexto(texto.trim() ? formatarCentavos(paraCentavos(texto)) : '')}
    />
  );
}
