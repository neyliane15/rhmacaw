import { Link } from 'react-router-dom';
import { EstadoVazio } from '../componentes/EstadoVazio.js';

export function NaoEncontrada(): JSX.Element {
  return (
    <div className="cartao">
      <EstadoVazio
        titulo="Essa tela nao existe"
        descricao="O endereco digitado nao corresponde a nenhuma area do RH Macaw."
        acao={
          <Link to="/" className="botao-primario">
            Voltar ao painel
          </Link>
        }
      />
    </div>
  );
}
