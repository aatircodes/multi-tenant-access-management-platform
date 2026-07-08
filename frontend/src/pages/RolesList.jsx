import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import styles from './RolesList.module.css';

// Fixed, closed permission catalog — documented as permanently fixed at 13 codes.
// Not fetched from any endpoint since none exists (nor should one, for a closed set).
export const ALL_PERMISSIONS = [
  { code: 'RESOURCE_CREATE', description: 'Can create resources' },
  { code: 'RESOURCE_READ', description: 'Can read resources' },
  { code: 'RESOURCE_UPDATE', description: 'Can update resources' },
  { code: 'RESOURCE_DELETE', description: 'Can delete resources' },
  { code: 'ROLE_CREATE', description: 'Can create roles' },
  { code: 'ROLE_DELETE', description: 'Can delete roles' },
  { code: 'ROLE_READ', description: 'Can read roles' },
  { code: 'ROLE_MANAGE', description: 'Can assign and unassign roles to/from users' },
  { code: 'PERMISSION_MANAGE', description: 'Can add and remove permissions on a role' },
  { code: 'ADMIN_TRANSFER', description: 'Can transfer admin ownership to another user' },
  { code: 'USER_INVITE', description: 'Can invite, list, and revoke user invitations' },
  { code: 'USER_DEACTIVATE', description: 'Can deactivate a user' },
  { code: 'AUDIT_VIEW', description: 'Can view audit logs' },
];

function RolesList() {
  const { hasPermission } = useContext(AuthContext);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Assigning a permission during role creation calls POST /roles/{roleId}/permissions/{permissionId},
  // gated on PERMISSION_MANAGE — a separate permission from ROLE_CREATE. A user without it can still
  // create a role, just not with any permissions attached from this modal. A role with zero
  // permissions is a valid, ordinary state — it can be filled in later by whoever holds
  // PERMISSION_MANAGE, from the role detail screen.
  const canManagePermissions = hasPermission('PERMISSION_MANAGE');

  // Authoritative code -> id map, resolved from the Admin role (which always holds every
  // permission in the catalog), so the create-role flow can call the assign endpoint correctly.
  const [permissionIdByCode, setPermissionIdByCode] = useState({});

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [selectedCodes, setSelectedCodes] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadRoles = async () => {
    setLoading(true);
    setError('');
    try {
      const rolesRes = await axiosClient.get('/roles');
      setRoles(rolesRes.data);

      const adminRole = rolesRes.data.find((r) => r.name === 'Admin');
      if (adminRole) {
        const adminPermsRes = await axiosClient.get(`/roles/${adminRole.id}/permissions`);
        const idMap = {};
        adminPermsRes.data.forEach((p) => {
          idMap[p.code] = p.id;
        });
        setPermissionIdByCode(idMap);
      }
    } catch (err) {
      setError('Failed to load roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const togglePermission = (code) => {
    if (!canManagePermissions) return;
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const openCreateModal = () => {
    setNewRoleName('');
    setSelectedCodes(new Set());
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const createRes = await axiosClient.post('/roles', { name: newRoleName });
      const newRoleId = createRes.data.id;

      // Assign each selected permission in sequence (there may be zero — that's fine, a role
      // can exist with no permissions and be configured later). If one fails partway through,
      // the role still exists with whichever permissions succeeded — surfaced via the error
      // message below rather than silently losing track of a partial result.
      const codesToAssign = Array.from(selectedCodes);
      for (const code of codesToAssign) {
        const permissionId = permissionIdByCode[code];
        if (permissionId) {
          await axiosClient.post(`/roles/${newRoleId}/permissions/${permissionId}`);
        }
      }

      setShowCreateModal(false);
      setNewRoleName('');
      setSelectedCodes(new Set());
      await loadRoles();
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setCreateError('A role with this name already exists.');
      } else {
        setCreateError(
          'Role created, but one or more permissions failed to assign. Open the role to finish configuring it.'
        );
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
                <button type="button" className={styles.btnPrimary} onClick={openCreateModal}>
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
                    <Link to={`/roles/${role.id}`} className={styles.roleRow} key={role.id}>
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
          <div
            className={`${styles.modalCard} ${styles.modalCardWide}`}
            onClick={(e) => e.stopPropagation()}
          >
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

              <div className={styles.sectionLabel}>Permissions</div>
              {!canManagePermissions && (
                <div className={styles.saveNote}>
                  You don't have permission to assign permissions. The role will be created
                  without any — someone with that permission can add them afterward.
                </div>
              )}
              <div className={styles.permList}>
                {ALL_PERMISSIONS.map((permission) => (
                  <div className={styles.permRow} key={permission.code}>
                    <div className={styles.permLeft}>
                      <div className={styles.permCode}>{permission.code}</div>
                      <div className={styles.permDesc}>{permission.description}</div>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={selectedCodes.has(permission.code)}
                        disabled={!canManagePermissions}
                        onChange={() => togglePermission(permission.code)}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </div>
                ))}
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
                  {creating ? 'Creating…' : 'Create role'}
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