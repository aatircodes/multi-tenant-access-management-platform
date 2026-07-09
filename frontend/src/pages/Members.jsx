import { useState, useEffect, useContext } from 'react';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import styles from './Members.module.css';

function Members() {
  const { claims, hasPermission, loadPermissions, loadRoleNames } = useContext(AuthContext);
  const currentUserId = claims?.userId;

  // Assign/unassign role — POST /roles/{roleId}/assign/{userId} and
  // DELETE /roles/{roleId}/unassign/{userId} are both gated on ROLE_MANAGE
  // (renamed from ROLE_ASSIGN).
  const canAssignRole = hasPermission('ROLE_MANAGE');
  // Transfer admin — POST /roles/transfer-admin/{newUserId} is gated on its
  // own ADMIN_TRANSFER permission, split out from ROLE_ASSIGN. This is
  // deliberately NOT the same flag as canAssignRole: a user with ROLE_MANAGE
  // but not ADMIN_TRANSFER can assign/unassign ordinary roles but must not
  // see "Make Admin" as available.
  const canTransferAdmin = hasPermission('ADMIN_TRANSFER');
  // Deactivate — PATCH /users/{userId}/deactivate is gated on USER_DEACTIVATE
  // (split out from USER_INVITE).
  const canDeactivate = hasPermission('USER_DEACTIVATE');

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openPopoverId, setOpenPopoverId] = useState(null);

  const [modalType, setModalType] = useState(null); // 'deactivate' | 'transfer' | 'assign' | 'unassign' | null
  const [modalTarget, setModalTarget] = useState(null); // the user object
  const [modalRole, setModalRole] = useState(null); // { id, name } — only used for unassign
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, rolesRes] = await Promise.all([
        axiosClient.get('/users'),
        axiosClient.get('/roles'),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
    } catch (err) {
      setError('Failed to load members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const closePopovers = () => setOpenPopoverId(null);
    document.addEventListener('click', closePopovers);
    return () => document.removeEventListener('click', closePopovers);
  }, []);

  const toggleRolePopover = (userId, e) => {
    e.stopPropagation();
    setOpenPopoverId((prev) => (prev === userId ? null : userId));
  };

  const openModal = (type, user, role = null) => {
    setModalType(type);
    setModalTarget(user);
    setModalRole(role);
    setModalError('');
    setSelectedRoleId('');
  };

  const closeModal = () => {
    setModalType(null);
    setModalTarget(null);
    setModalRole(null);
    setModalError('');
    setSelectedRoleId('');
  };

  const confirmModalAction = async () => {
    if (!modalTarget) return;
    setModalSubmitting(true);
    setModalError('');
    try {
      if (modalType === 'deactivate') {
        await axiosClient.patch(`/users/${modalTarget.id}/deactivate`);
        closeModal();
        await loadUsers();
      } else if (modalType === 'transfer') {
        await axiosClient.post(`/roles/transfer-admin/${modalTarget.id}`);
        // Permission checks are resolved live against the DB on every request
        // (see CustomPermissionEvaluator), so the caller doesn't need a forced
        // re-login just because their access changed — refreshing the client's
        // permission state is enough for the UI to correctly reflect their new
        // (now empty) access immediately.
        closeModal();
        await loadPermissions();
        await loadRoleNames();
        await loadUsers();
      } else if (modalType === 'assign') {
        await axiosClient.post(`/roles/${selectedRoleId}/assign/${modalTarget.id}`);
        closeModal();
        await loadUsers();
      } else if (modalType === 'unassign') {
        await axiosClient.delete(`/roles/${modalRole.id}/unassign/${modalTarget.id}`);
        closeModal();
        await loadUsers();
      }
    } catch (err) {
      const backendMessage = err.response?.data?.message;
      setModalError(backendMessage || 'Action failed. Please try again.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleRemoveTagClick = (e, user, roleName) => {
    e.stopPropagation();
    const role = roles.find((r) => r.name === roleName);
    if (role) {
      openModal('unassign', user, { id: role.id, name: role.name });
    }
  };

  return (
    <div className={styles.app}>
      <Topbar />
      <div className={styles.layout}>
        <Sidebar active="members" />
        <div className={styles.content}>
          <div className={styles.contentInner}>
            <div className={styles.pageHeader}>
              <div>
                <div className={styles.pageTitle}>Members</div>
                <div className={styles.pageSubtitle}>
                  Everyone with access to your organization, and their assigned roles.
                </div>
              </div>
            </div>

            {error && <div className={styles.membersError}>{error}</div>}

            {loading ? (
              <div className={styles.loadingState}>Loading members…</div>
            ) : (
              <div className={styles.card}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isSelf = String(user.id) === String(currentUserId);
                      const isDisabled = user.status === 'DISABLED';
                      const isAdmin = user.roles.includes('Admin');
                      const [firstRole, ...restRoles] = user.roles;
                      const onlyOneRole = user.roles.length <= 1;

                      // Base conditions that apply regardless of permission —
                      // these describe *why an action never makes sense here*,
                      // independent of what the current viewer is allowed to do.
                      const baseDisabled = isSelf || isDisabled || isAdmin;
                      let baseDisabledReason = '';
                      if (isSelf) baseDisabledReason = 'You cannot modify your own account';
                      else if (isDisabled) baseDisabledReason = 'This member is deactivated';
                      else if (isAdmin) baseDisabledReason = 'This member is already the Admin';

                      // Assign role — gated on ROLE_MANAGE (matches
                      // POST /roles/{roleId}/assign/{userId} on the backend)
                      const assignRoleBaseDisabled = isSelf || isDisabled;
                      const assignRoleDisabled = assignRoleBaseDisabled || !canAssignRole;
                      let assignRoleReason = '';
                      if (isSelf) assignRoleReason = 'You cannot modify your own account';
                      else if (isDisabled) assignRoleReason = 'This member is deactivated';
                      else if (!canAssignRole) assignRoleReason = 'You do not have permission to assign roles';

                      // Make Admin (transfer-admin) — gated on ADMIN_TRANSFER (matches
                      // POST /roles/transfer-admin/{newUserId} on the backend). Deliberately
                      // independent of canAssignRole — see note at the top of this file.
                      const transferDisabled = baseDisabled || !canTransferAdmin;
                      let transferReason = baseDisabledReason;
                      if (!baseDisabled && !canTransferAdmin) {
                        transferReason = 'You do not have permission to transfer admin rights';
                      }

                      // Deactivate — gated on USER_DEACTIVATE (matches
                      // PATCH /users/{userId}/deactivate on the backend)
                      const deactivateDisabled = baseDisabled || !canDeactivate;
                      let deactivateReason = baseDisabledReason;
                      if (!baseDisabled && !canDeactivate) {
                        deactivateReason = 'You do not have permission to deactivate members';
                      }

                      const isSystemRoleName = (roleName) =>
                        roleName === 'Admin' || roleName === 'No Access';

                      const renderRoleTag = (roleName, isPopoverTag) => {
                        const isAdminTag = roleName === 'Admin';
                        const isSystemTag = isSystemRoleName(roleName);
                        // Unassign calls DELETE /roles/{roleId}/unassign/{userId},
                        // which is also gated on ROLE_MANAGE on the backend. System
                        // roles (Admin, No Access) are excluded regardless of that
                        // permission — Admin is handled via transfer-admin only, and
                        // No Access is a backend-managed fallback, not something meant
                        // to be manually assigned or removed through this screen.
                        const canRemove =
                          !isSystemTag && !onlyOneRole && !isDisabled && canAssignRole;
                        return (
                          <span
                            key={roleName}
                            className={`${styles.roleTag} ${isAdminTag ? styles.roleTagAdmin : ''} ${
                              canRemove ? styles.roleTagRemovable : ''
                            }`}
                            title={
                              isAdminTag
                                ? 'Admin is transferred, not removed'
                                : roleName === 'No Access'
                                ? 'No Access is managed automatically and cannot be edited here'
                                : onlyOneRole
                                ? 'User must have at least one role'
                                : !canAssignRole
                                ? 'You do not have permission to unassign roles'
                                : ''
                            }
                          >
                            {roleName}
                            {canRemove && (
                              <button
                                type="button"
                                className={styles.roleTagRemoveBtn}
                                onClick={(e) => handleRemoveTagClick(e, user, roleName)}
                                aria-label={`Unassign ${roleName} role`}
                              >
                                Unassign
                              </button>
                            )}
                          </span>
                        );
                      };

                      return (
                        <tr key={user.id} className={isDisabled ? styles.disabledRow : ''}>
                          <td>
                            <div className={styles.userEmail}>
                              {user.email} {isSelf && <span className={styles.selfTag}>(you)</span>}
                            </div>
                            <div className={styles.userJoined}>
                              Joined {formatDate(user.createdAt)}
                            </div>
                          </td>
                          <td>
                            <div className={styles.roleTags}>
                              {renderRoleTag(firstRole, false)}
                              {restRoles.length > 0 && (
                                <button
                                  type="button"
                                  className={styles.roleMore}
                                  onClick={(e) => toggleRolePopover(user.id, e)}
                                >
                                  +{restRoles.length} more
                                  {openPopoverId === user.id && (
                                    <div className={`${styles.roleMorePopover} ${styles.roleMorePopoverOpen}`}>
                                      {restRoles.map((role) => renderRoleTag(role, true))}
                                    </div>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${
                                isDisabled ? styles.statusDisabled : styles.statusActive
                              }`}
                            >
                              {isDisabled ? 'Deactivated' : 'Active'}
                            </span>
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                className={styles.iconBtn}
                                disabled={assignRoleDisabled}
                                title={assignRoleReason}
                                onClick={() => openModal('assign', user)}
                              >
                                Assign role
                              </button>
                              <button
                                type="button"
                                className={styles.iconBtn}
                                disabled={transferDisabled}
                                title={transferReason}
                                onClick={() => openModal('transfer', user)}
                              >
                                Make Admin
                              </button>
                              <button
                                type="button"
                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                disabled={deactivateDisabled}
                                title={deactivateReason}
                                onClick={() => openModal('deactivate', user)}
                              >
                                Deactivate
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalType && modalTarget && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            {modalType === 'deactivate' && (
              <>
                <div className={styles.modalTitle}>Deactivate member</div>
                <div className={styles.modalBody}>
                  Are you sure you want to deactivate <strong>{modalTarget.email}</strong>? They
                  will lose access immediately.
                </div>
              </>
            )}

            {modalType === 'transfer' && (
              <>
                <div className={styles.modalTitle}>Transfer admin rights</div>
                <div className={styles.modalBody}>
                  Make <strong>{modalTarget.email}</strong> the new Admin? You will lose Admin
                  access immediately. There can only be one Admin per organization.
                </div>
              </>
            )}

            {modalType === 'assign' && (
              <>
                <div className={styles.modalTitle}>Assign role</div>
                <div className={styles.modalBody}>
                  Add an additional role to <strong>{modalTarget.email}</strong>. Roles they
                  already hold are not shown below.
                </div>
                <div className={styles.field}>
                  <label>Role</label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className={styles.roleSelect}
                  >
                    <option value="">Select a role…</option>
                    {roles
                      .filter((r) => !['Admin', 'No Access'].includes(r.name) && !modalTarget.roles.includes(r.name))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            )}

            {modalType === 'unassign' && modalRole && (
              <>
                <div className={styles.modalTitle}>Remove role</div>
                <div className={styles.modalBody}>
                  Remove <strong>{modalRole.name}</strong> from <strong>{modalTarget.email}</strong>?
                  They will lose whichever permissions this role granted, unless another one of
                  their roles also grants them.
                </div>
              </>
            )}

            {modalError && <div className={styles.modalError}>{modalError}</div>}

            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={closeModal}>
                Cancel
              </button>
              {modalType === 'deactivate' && (
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={confirmModalAction}
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Deactivating…' : 'Deactivate'}
                </button>
              )}
              {modalType === 'transfer' && (
                <button
                  type="button"
                  className={styles.btnAccent}
                  onClick={confirmModalAction}
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Transferring…' : 'Transfer Admin'}
                </button>
              )}
              {modalType === 'assign' && (
                <button
                  type="button"
                  className={styles.btnAccent}
                  onClick={confirmModalAction}
                  disabled={modalSubmitting || !selectedRoleId}
                >
                  {modalSubmitting ? 'Assigning…' : 'Assign'}
                </button>
              )}
              {modalType === 'unassign' && (
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={confirmModalAction}
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Removing…' : 'Remove role'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Members;