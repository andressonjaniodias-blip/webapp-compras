/**
 * A linha discreta que diz o que a sincronizacao esta fazendo.
 *
 * Ela existe para que a lentidao do servidor gratuito seja informacao, e nao
 * susto: "sincronizando" e um estado normal que pode durar um minuto enquanto o
 * servidor acorda. Some sozinha quando nao ha nada a dizer — barra de status
 * permanente vira ruido e para de ser lida.
 */

import { useApp } from '../estado';
import { contagem } from '../lib/texto';

export function BarraSituacao() {
  const { situacao, pendentes, offline, mensagem } = useApp();

  if (situacao === 'sincronizando') {
    return (
      <p className="aviso" role="status">
        Sincronizando… (o servidor pode levar até um minuto para acordar)
      </p>
    );
  }

  if (offline && pendentes > 0) {
    return (
      <p className="aviso aviso-atencao" role="status">
        Sem conexão com o servidor. {contagem(pendentes, 'registro esperando', 'registros esperando')}{' '}
        para subir — nada se perde, {pendentes === 1 ? 'ele sobe' : 'eles sobem'} sozinho
        {pendentes === 1 ? '' : 's'} quando a internet voltar.
      </p>
    );
  }

  if (situacao === 'erro' && mensagem) {
    return <p className="aviso aviso-erro" role="alert">{mensagem}</p>;
  }

  return null;
}
