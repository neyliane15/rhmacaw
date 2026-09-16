import { Navigate, Route, Routes } from 'react-router-dom';
import { Guarda } from './componentes/Guarda.js';
import { Layout } from './componentes/Layout.js';
import { Banco } from './paginas/Banco.js';
import { Colaboradores } from './paginas/Colaboradores.js';
import { ColaboradorForm } from './paginas/ColaboradorForm.js';
import { Comissoes } from './paginas/Comissoes.js';
import { Dashboard } from './paginas/Dashboard.js';
import { DecimoTerceiro } from './paginas/DecimoTerceiro.js';
import { Faltas } from './paginas/Faltas.js';
import { Ferias } from './paginas/Ferias.js';
import { Folha } from './paginas/Folha.js';
import { Login } from './paginas/Login.js';
import { NaoEncontrada } from './paginas/NaoEncontrada.js';
import { Relatorios } from './paginas/Relatorios.js';
import { Rescisoes } from './paginas/Rescisoes.js';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Guarda>
            <Layout />
          </Guarda>
        }
      >
        <Route index element={<Dashboard />} />
        <Route
          path="/colaboradores"
          element={
            <Guarda permissao="colaboradores:ler">
              <Colaboradores />
            </Guarda>
          }
        />
        <Route
          path="/colaboradores/novo"
          element={
            <Guarda permissao="colaboradores:criar">
              <ColaboradorForm />
            </Guarda>
          }
        />
        <Route
          path="/colaboradores/:id"
          element={
            <Guarda permissao="colaboradores:ler">
              <ColaboradorForm />
            </Guarda>
          }
        />
        <Route
          path="/faltas"
          element={
            <Guarda permissao="faltas:ler">
              <Faltas />
            </Guarda>
          }
        />
        <Route
          path="/ferias"
          element={
            <Guarda permissao="ferias:ler">
              <Ferias />
            </Guarda>
          }
        />
        <Route
          path="/comissoes"
          element={
            <Guarda permissao="comissoes:ler">
              <Comissoes />
            </Guarda>
          }
        />
        <Route
          path="/folha"
          element={
            <Guarda permissao="folha:ler">
              <Folha />
            </Guarda>
          }
        />
        <Route
          path="/decimo-terceiro"
          element={
            <Guarda permissao="folha:ler">
              <DecimoTerceiro />
            </Guarda>
          }
        />
        <Route
          path="/rescisoes"
          element={
            <Guarda permissao="rescisoes:ler">
              <Rescisoes />
            </Guarda>
          }
        />
        <Route
          path="/banco"
          element={
            <Guarda permissao="banco:ler">
              <Banco />
            </Guarda>
          }
        />
        <Route
          path="/relatorios"
          element={
            <Guarda permissao="relatorios:ler">
              <Relatorios />
            </Guarda>
          }
        />
        <Route path="/404" element={<NaoEncontrada />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}
