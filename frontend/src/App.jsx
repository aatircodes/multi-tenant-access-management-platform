import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import RegisterSuccess from './pages/RegisterSuccess';
import Home from './pages/Home';
import Invitations from './pages/Invitations';
import AcceptInvitation from './pages/AcceptInvitation';
import Members from './pages/Members';
import RolesList from './pages/RolesList';
import RoleDetail from './pages/RoleDetail';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/register-success" element={<RegisterSuccess />} />
      <Route path="/home" element={<Home />} />
      <Route path="/invitations" element={<Invitations />} />
      <Route path="/accept-invitation" element={<AcceptInvitation />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
      <Route path="/members" element={<Members />} />
      <Route path="/roles" element={<RolesList />} />
      <Route path="/roles/:roleId" element={<RoleDetail />} />
    </Routes>
  );
}

export default App;