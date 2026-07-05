import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import './Sidebar.css';

const NAV_ITEMS = [
  { key: 'home', label: 'Home', path: '/home', permission: null },
  { key: 'resources', label: 'Resources', path: '/resources', permission: 'RESOURCE_READ' },
  { key: 'roles', label: 'Roles & Permissions', path: '/roles', permission: 'ROLE_READ' },
  { key: 'invitations', label: 'Invitations', path: '/invitations', permission: 'USER_INVITE' },
  { key: 'members', label: 'Members', path: '/members', permission: 'ROLE_READ' },
  { key: 'audit-log', label: 'Audit log', path: '/audit-log', permission: 'AUDIT_VIEW' },
];

function Sidebar({ active }) {
  const { hasPermission } = useContext(AuthContext);

  return (
    <div className="sidebar">
      {NAV_ITEMS.map((item) => {
        const allowed = !item.permission || hasPermission(item.permission);

        if (!allowed) {
          return (
            <div
              key={item.key}
              className="nav-item nav-item-disabled"
              title="You don't have permission to access this section"
            >
              {item.label}
            </div>
          );
        }

        return (
          <Link
            key={item.key}
            to={item.path}
            className={`nav-item ${active === item.key ? 'active' : ''}`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export default Sidebar;