import { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { ALL_PERMISSIONS } from './RolesList';
import styles from './RoleDetail.module.css';

function RoleDetail() {
  const { roleId } = useParams();
  const { hasPermission } = useContext(AuthContext);

  const [role, setRole] = useState(null);
  const [grantedCodes, setGrantedCodes] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingCode, setTogglingCode] = useState(null);
  const [toggleError, setToggleError] = useState('');

  const canAssign = hasPermission('ROLE_ASSIGN');

  const loadRole = async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, permsRes] = await Promise.all([
        axiosClient.get('/roles'),
        axiosClient.get(`/roles/${roleId}/permissions`),
      ]);
      const matchedRole = rolesRes.data.find((r) => String(r.id) === String(roleId));
      setRole(matchedRole || null);
      setGrantedCodes(new Set(permsRes.data.map((p) => p.code)));
    } catch (err) {
      setError('Failed to load role details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  const isAdmin = role?.name === 'Admin';

  const handleToggle = async (permission, currentlyGranted) => {
    setToggleError('');
    setTogglingCode(permission.code);

    // Optimistic update — flip the switch immediately, roll back on failure
    setGrantedCodes((prev) => {
      const next = new Set(prev);
      if (currentlyGranted) {
        next.delete(permission.code);
      } else {
        next.add(permission.code);
      }
      return next;
    });

    try {
      if (currentlyGranted) {
        await axiosClient.delete(`/roles/${roleId}/permissions/${permission.id}`);
      } else {
        await axiosClient.post(`/roles/${roleId}/permissions/${permission.id}`);
      }
    } catch (err) {
      // Roll back the optimistic change
      setGrantedCodes((prev) => {
        const next = new Set(prev);
        if (currentlyGranted) {
          next.add(permission.code);
        } else {
          next.delete(permission.code);
        }
        return next;
      });
      setToggleError('Failed to update permission. Please try again.');
    } finally {
      setTogglingCode(null);
    }
  };

  return (
    <div className={styles.app}>
      <Topbar />
      <div className={styles.layout}>
        <Sidebar active="roles" />
        <div className={styles.content}>
          <div className={styles.contentInner}>
            <div className={styles.breadcrumb}>
              <Link to="/roles">Roles & Permissions</Link> &nbsp;/&nbsp; {role?.name || '…'}
            </div>

            {error && <div className={styles.roleError}>{error}</div>}

            {loading ? (
              <div className={styles.loadingState}>Loading role…</div>
            ) : !role ? (
              <div className={styles.roleError}>Role not found.</div>
            ) : (
              <>
                <div className={styles.pageTitle}>
                  {role.name}
                  {isAdmin && <span className={styles.lockedTag}>LOCKED</span>}
                </div>
                <div className={styles.pageSubtitle}>
                  {isAdmin
                    ? 'Admin has full access by default and cannot be changed.'
                    : 'Toggle which permissions this role grants.'}
                </div>

                <div className={styles.card}>
                  {ALL_PERMISSIONS.map((permission) => {
                    // Look up the real permission ID from what the backend actually returned
                    // for this role, since ALL_PERMISSIONS (the fixed catalog) only has codes —
                    // the numeric ID needed for the assign/remove endpoints comes from the API.
                    const granted = grantedCodes.has(permission.code);
                    const isToggling = togglingCode === permission.code;
                    const switchDisabled = isAdmin || !canAssign || isToggling;

                    return (
                      <div className={styles.permRow} key={permission.code}>
                        <div className={styles.permLeft}>
                          <div className={styles.permCode}>{permission.code}</div>
                          <div className={styles.permDesc}>{permission.description}</div>
                        </div>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={granted}
                            disabled={switchDisabled}
                            onChange={() =>
                              handleToggle(
                                { code: permission.code, id: resolvePermissionId(permission.code) },
                                granted
                              )
                            }
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                    );
                  })}
                </div>

                {toggleError && <div className={styles.toggleError}>{toggleError}</div>}

                {isAdmin ? (
                  <>
                    <div className={styles.saveNote}>
                      Admin permissions are fixed and cannot be toggled.
                    </div>
                    <div className={styles.pointerNote}>
                      <div className={styles.pointerNoteIcon}>i</div>
                      <div className={styles.pointerNoteText}>
                        To transfer admin rights to another member, go to{' '}
                        <Link to="/members">Members</Link>.
                      </div>
                    </div>
                  </>
                ) : (
                  !canAssign && (
                    <div className={styles.saveNote}>
                      You don't have permission to modify role permissions.
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Permission IDs (1-9) are fixed and stable per the backend's documented closed catalog —
// they match the order GET /api/roles/{roleId}/permissions returns for a role holding all 9
// (e.g. Admin), which the app has already observed. Hardcoded alongside ALL_PERMISSIONS since
// both describe the same fixed, unchanging catalog.
const PERMISSION_ID_BY_CODE = {
  RESOURCE_CREATE: 1,
  RESOURCE_READ: 2,
  RESOURCE_UPDATE: 3,
  RESOURCE_DELETE: 4,
  ROLE_CREATE: 5,
  ROLE_READ: 6,
  ROLE_ASSIGN: 7,
  USER_INVITE: 8,
  AUDIT_VIEW: 9,
};

function resolvePermissionId(code) {
  return PERMISSION_ID_BY_CODE[code];
}

export default RoleDetail;