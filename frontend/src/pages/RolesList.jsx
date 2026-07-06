import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import styles from './RolesList.module.css';

// Fixed, closed permission catalog — documented as permanently fixed at 9 codes.
// Not fetched from any endpoint since none exists (nor should one, for a closed set).
export const ALL_PERMISSIONS = [
  { code: 'RESOURCE_CREATE', description: 'Can create resources' },
  { code: 'RESOURCE_READ', description: 'Can read resources' },
  { code: 'RESOURCE_UPDATE', description: 'Can update resources' },
  { code: 'RESOURCE_DELETE', description: 'Can delete resources' },
  { code: 'ROLE_CREATE', description: 'Can create roles' },
  { code: 'ROLE_READ', description: 'Can read roles' },
  { code: 'ROLE_ASSIGN', description: 'Can assign roles and permissions' },
  { code: 'USER_INVITE', description: 'Can invite users' },
  { code: 'AUDIT_VIEW', description: 'Can view audit logs' },
];

function RolesList() {
  const { hasPermission } = useContext(AuthContext);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadRoles = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axiosClient.get('/roles');
      setRoles(res.data);
    } catch (err) {
      setError('Failed to load roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const handleCreateRole = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await axiosClient.post('/roles', { name: newRoleName });
      setShowCreateModal(false);
      setNewRoleName('');
      await loadRoles();
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setCreateError('A role with this name already exists.');
      } else {
        setCreateError('Failed to create role. Please try again.');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.app}>
      <Topbar />
      <div className={styles.layout}>
        <Sidebar active="roles" />
        <div className={styles.content}>
          <div className={styles.contentInner}>
            <div className={styles.pageHeader}>
              <div>
                <div className={styles.pageTitle}>Roles & Permissions</div>
                <div className={styles.pageSubtitle}>
                  Define what each role in your organization can do.
                </div>
              </div>
              {hasPermission('ROLE_CREATE') && (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setShowCreateModal(true)}
                >
                  + New role
                </button>
              )}
            </div>

            {error && <div className={styles.rolesError}>{error}</div>}

            {loading ? (
              <div className={styles.loadingState}>Loading roles…</div>
            ) : (
              <div className={styles.roleList}>
                {roles.map((role) => {
                  const isAdmin = role.name === 'Admin';
                  return (
                    <Link
                      to={`/roles/${role.id}`}
                      className={styles.roleRow}
                      key={role.id}
                    >
                      <div className={styles.roleLeft}>
                        <div className={styles.roleName}>
                          {role.name}
                          {isAdmin && <span className={styles.lockedTag}>LOCKED</span>}
                        </div>
                        <div className={styles.roleMeta}>
                          <b>{role.memberCount}</b> member{role.memberCount === 1 ? '' : 's'} assigned
                        </div>
                      </div>
                      <div className={styles.roleRight}>
                        <span className={styles.chevronRight}>›</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>New role</div>
            <form onSubmit={handleCreateRole}>
              <div className={styles.field}>
                <label>Role name</label>
                <input
                  type="text"
                  placeholder="e.g. Support Agent"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {createError && <div className={styles.modalError}>{createError}</div>}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={creating}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default RolesList;