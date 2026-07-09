import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { ALL_PERMISSIONS } from './RolesList';
import styles from './RoleDetail.module.css';

function RoleDetail() {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useContext(AuthContext);

  const [role, setRole] = useState(null);
  const [grantedCodes, setGrantedCodes] = useState(new Set());
  const [permissionIdByCode, setPermissionIdByCode] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissionsViewDenied, setPermissionsViewDenied] = useState(false);
  const [togglingCode, setTogglingCode] = useState(null);
  const [toggleError, setToggleError] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Toggling a permission calls POST/DELETE /roles/{roleId}/permissions/{permissionId},
  // gated on PERMISSION_MANAGE (renamed/split from ROLE_ASSIGN).
  const canManagePermissions = hasPermission('PERMISSION_MANAGE');
  // Deleting a role calls DELETE /api/roles/{roleId}, gated on its own ROLE_DELETE —
  // no longer the same permission as ROLE_CREATE.
  const canDelete = hasPermission('ROLE_DELETE');

  const loadRole = async () => {
    setLoading(true);
    setError('');
    setPermissionsViewDenied(false);
    try {
      const rolesRes = await axiosClient.get('/roles');
      const matchedRole = rolesRes.data.find((r) => String(r.id) === String(roleId));
      const adminRole = rolesRes.data.find((r) => r.name === 'Admin');
      setRole(matchedRole || null);

      if (!matchedRole) {
        setLoading(false);
        return;
      }

      const [thisRoleResult, adminResult] = await Promise.allSettled([
        axiosClient.get(`/roles/${roleId}/permissions`),
        adminRole
          ? axiosClient.get(`/roles/${adminRole.id}/permissions`)
          : Promise.resolve({ data: [] }),
      ]);

      if (thisRoleResult.status === 'fulfilled') {
        setGrantedCodes(new Set(thisRoleResult.value.data.map((p) => p.code)));
      } else {
        // 403 — user lacks ROLE_READ/PERMISSION_MANAGE. Don't render an
        // empty Set as "no permissions"; show an explicit denied state instead.
        setPermissionsViewDenied(true);
      }

      if (adminResult.status === 'fulfilled') {
        const idMap = {};
        adminResult.value.data.forEach((p) => {
          idMap[p.code] = p.id;
        });
        setPermissionIdByCode(idMap);
      }
      // If adminResult rejected, permissionIdByCode just stays {} — toggling
      // is already gated by canManagePermissions, so this only silently
      // disables toggling for an edge case, never shows wrong data.
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
  const hasMembers = (role?.memberCount ?? 0) > 0;
  const deleteDisabled = isAdmin || hasMembers || !canDelete;

  let deleteDisabledReason = '';
  if (isAdmin) deleteDisabledReason = 'The Admin role cannot be deleted';
  else if (hasMembers) deleteDisabledReason = 'Unassign all members from this role before deleting it';
  else if (!canDelete) deleteDisabledReason = "You don't have permission to delete roles";

  const handleToggle = async (code, currentlyGranted) => {
    const permissionId = permissionIdByCode[code];
    if (!permissionId) {
      setToggleError('Could not resolve this permission. Please refresh and try again.');
      return;
    }

    setToggleError('');
    setTogglingCode(code);

    setGrantedCodes((prev) => {
      const next = new Set(prev);
      if (currentlyGranted) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });

    try {
      if (currentlyGranted) {
        await axiosClient.delete(`/roles/${roleId}/permissions/${permissionId}`);
      } else {
        await axiosClient.post(`/roles/${roleId}/permissions/${permissionId}`);
      }
    } catch (err) {
      setGrantedCodes((prev) => {
        const next = new Set(prev);
        if (currentlyGranted) {
          next.add(code);
        } else {
          next.delete(code);
        }
        return next;
      });
      const backendMessage = err.response?.data?.message;
      setToggleError(backendMessage || 'Failed to update permission. Please try again.');
    } finally {
      setTogglingCode(null);
    }
  };

  const handleDeleteRole = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await axiosClient.delete(`/roles/${roleId}`);
      navigate('/roles');
    } catch (err) {
      const backendMessage = err.response?.data?.message;
      setDeleteError(backendMessage || 'Failed to delete role. Please try again.');
      setDeleting(false);
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
                <div className={styles.pageHeaderRow}>
                  <div>
                    <div className={styles.pageTitle}>
                      {role.name}
                      {isAdmin && <span className={styles.lockedTag}>LOCKED</span>}
                    </div>
                    <div className={styles.pageSubtitle}>
                      {isAdmin
                        ? 'Admin has full access by default and cannot be changed.'
                        : 'Toggle which permissions this role grants.'}
                    </div>
                  </div>
                  {!isAdmin && canDelete && (
                    <button
                      type="button"
                      className={styles.btnDeleteRole}
                      disabled={deleteDisabled}
                      title={deleteDisabledReason}
                      onClick={() => setShowDeleteModal(true)}
                    >
                      Delete role
                    </button>
                  )}
                </div>

                {permissionsViewDenied ? (
                  <div className={styles.card}>
                    <div className={styles.saveNote}>
                      You don't have permission to view this role's permissions.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.card}>
                      {ALL_PERMISSIONS.map((permission) => {
                        const granted = grantedCodes.has(permission.code);
                        const isToggling = togglingCode === permission.code;
                        const switchDisabled = isAdmin || !canManagePermissions || isToggling;

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
                                onChange={() => handleToggle(permission.code, granted)}
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
                      !canManagePermissions && (
                        <div className={styles.saveNote}>
                          You don't have permission to modify role permissions.
                        </div>
                      )
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Delete role</div>
            <div className={styles.modalBody}>
              Are you sure you want to delete <strong>{role?.name}</strong>? This cannot be undone.
            </div>
            {deleteError && <div className={styles.toggleError} style={{ marginBottom: 16 }}>{deleteError}</div>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnDangerSolid}
                onClick={handleDeleteRole}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoleDetail;