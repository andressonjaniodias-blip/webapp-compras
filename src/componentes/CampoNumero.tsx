/**
 * Campo de numero inteiro: por fora fala numero, por dentro guarda o texto que
 * esta sendo digitado.
 *
 * A separacao existe pelo mesmo motivo do `CampoDinheiro`, e aqui ela corrige um
 * bug que impedia o uso: escrever no estado a cada tecla fazia campo vazio virar
 * `Number('') || 1`, entao apagar o "1" gravava 1 de novo e ele voltava debaixo
 * do dedo. Digitar "12" era impossivel — em parcelas, em dia de fechamento e em
 * dia de vencimento.
 *
 * Vazio e estado VALIDO enquanto se digita, e por isso nao grava nada: e so um
 * passo do caminho ate o numero novo. Ao sair do campo o valor e preso entre
 * `min` e `max`, e campo vazio volta ao minimo.
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react';

interface Props {
  valor: number;
  onChange: (numero: number) => void;
  min: number;
  max: number;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function CampoNumero({ valor, onChange, min, max, id, disabled, ...resto }: Props) {
  const [texto, setTexto] = useState(() => String(valor));
  const ultimo = useRef(valor);

  // Ressincroniza quando o valor muda por fora — trocar de registro no mesmo
  // formulario, ou outro campo recalcular este.
  useEffect(() => {
    if (valor !== ultimo.current) {
      ultimo.current = valor;
      setTexto(String(valor));
    }
  }, [valor]);

  function preso(numero: number): number {
    if (!Number.isFinite(numero)) return min;
    return Math.min(max, Math.max(min, Math.floor(numero)));
  }

  function aoDigitar(evento: ChangeEvent<HTMLInputElement>) {
    const digitado = evento.target.value.replace(/[^0-9]/g, '');
    setTexto(digitado);
    if (digitado === '') return;
    const numero = preso(Number(digitado));
    ultimo.current = numero;
    onChange(numero);
  }

  function aoSair() {
    const numero = texto === '' ? min : preso(Number(texto));
    ultimo.current = numero;
    setTexto(String(numero));
    onChange(numero);
  }

  return (
    <input
      {...resto}
      id={id}
      className="entrada"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      value={texto}
      onChange={aoDigitar}
      onBlur={aoSair}
    />
  );
}
