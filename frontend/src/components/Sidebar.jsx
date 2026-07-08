import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import './Sidebar.css';

const NAV_ITEMS = [
  { key: 'home', label: 'Home', path: '/home', permissions: [] },
  { key: 'resources', label: 'Resources', path: '/resources', permissions: ['RESOURCE_READ'] },
  { key: 'roles', label: 'Roles & Permissions', path: '/roles', permissions: ['ROLE_READ', 'ROLE_MANAGE', 'PERMISSION_MANAGE', 'ADMIN_TRANSFER'] },
  { key: 'invitations', label: 'Invitations', path: '/invitations', permissions: ['USER_INVITE'] },
  { key: 'members', label: 'Members', path: '/members', permissions: ['ROLE_READ', 'ROLE_MANAGE', 'ADMIN_TRANSFER'] },
  { key: 'audit-log', label: 'Audit log', path: '/audit-log', permissions: ['AUDIT_VIEW'] },
];

function Sidebar({ active }) {
  const { hasAnyPermission } = useContext(AuthContext);

  return (
    <div className="sidebar">
      {NAV_ITEMS.map((item) => {
        const allowed = item.permissions.length === 0 || hasAnyPermission(item.permissions);

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