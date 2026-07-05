import { Link } from 'react-router-dom';
import './Sidebar.css';

const NAV_ITEMS = [
  { key: 'home', label: 'Home', path: '/home' },
  { key: 'resources', label: 'Resources', path: '/resources' },
  { key: 'roles', label: 'Roles & Permissions', path: '/roles' },
  { key: 'invitations', label: 'Invitations', path: '/invitations' },
  { key: 'members', label: 'Members', path: '/members' },
  { key: 'audit-log', label: 'Audit log', path: '/audit-log' },
];

function Sidebar({ active }) {
  return (
    <div className="sidebar">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          to={item.path}
          className={`nav-item ${active === item.key ? 'active' : ''}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export default Sidebar;