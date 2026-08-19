/**
 * A linha discreta que diz o que a sincronizacao esta fazendo.
 *
 * Ela existe para que a lentidao do servidor gratuito seja informacao, e nao
 * susto: "sincronizando" e um estado normal que pode durar um minuto enquanto o
 * servidor acorda. Some sozinha quando nao ha nada a dizer — barra de status
 * permanente vira ruido e para de ser lida.
 */

import { useApp } from '../estado';

export function BarraSituacao() {
  const { situacao, pendentes, offline, mensagem } = useApp();

  if (situacao === 'sincronizando') {
    return <p className="aviso">Sincronizando… (o servidor pode levar até um minuto para acordar)</p>;
  }

  if (offline && pendentes > 0) {
    return (
      <p className="aviso aviso-atencao">
        Sem conexão com o servidor. {pendentes} registro(s) esperando para subir — nada se perde,
        eles sobem sozinhos quando a internet voltar.
      </p>
    );
  }

  if (situacao === 'erro' && mensagem) {
    return <p className="aviso aviso-erro">{mensagem}</p>;
  }

  return null;
}
