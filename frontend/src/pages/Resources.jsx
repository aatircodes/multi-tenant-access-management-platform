import { useState, useEffect, useCallback, useContext } from 'react';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import styles from './Resources.module.css';

function Resources() {
  const { hasPermission } = useContext(AuthContext);

  const [resources, setResources] = useState([]);
  const [ownerMap, setOwnerMap] = useState({}); // userId -> email
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination — UI is 1-indexed, API is 0-indexed
  const [uiPage, setUiPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const PAGE_SIZE = 10;

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Create panel
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit modal (reusing the shared pattern: one modal, content switches)
  const [editingResource, setEditingResource] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deletingResource, setDeletingResource] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canCreate = hasPermission('RESOURCE_CREATE');
  const canUpdate = hasPermission('RESOURCE_UPDATE');
  const canDelete = hasPermission('RESOURCE_DELETE');
  const canViewList = hasPermission('RESOURCE_READ');

  const loadOwnerMap = useCallback(async () => {
    const result = await Promise.allSettled([axiosClient.get('/users/basic-info')]);
    if (result[0].status === 'fulfilled') {
      const map = {};
      result[0].value.data.forEach((user) => {
        map[user.id] = user.email;
      });
      setOwnerMap(map);
    }
  }, []);

  const loadResources = useCallback(async (pageNumberUi) => {
    setLoading(true);
    setError('');
    try {
      const apiPage = pageNumberUi - 1; // convert to 0-indexed
      const response = await axiosClient.get('/resources', {
        params: { page: apiPage, size: PAGE_SIZE },
      });
      setResources(response.data.content);
      setTotalPages(response.data.totalPages);
      setTotalElements(response.data.totalElements);
    } catch (err) {
      setError('Failed to load resources. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOwnerMap();
  }, [loadOwnerMap]);

  useEffect(() => {
    if (!isSearching) {
      loadResources(uiPage);
    }
  }, [uiPage, isSearching, loadResources]);

  const handleSearchChange = async (e) => {
    const value = e.target.value;
    setSearchTerm(value);

    if (value.trim() === '') {
      setIsSearching(false);
      setUiPage(1);
      return;
    }

    setIsSearching(true);
    setLoading(true);
    setError('');
    try {
      const response = await axiosClient.get('/resources/search', {
        params: { name: value.trim() },
      });
      setResources(response.data);
    } catch (err) {
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreateError('');
    if (!createName.trim()) {
      setCreateError('Name is required.');
      return;
    }
    setCreating(true);
    try {
      await axiosClient.post('/resources', {
        name: createName.trim(),
        description: createDescription.trim() || null,
      });
      setCreateName('');
      setCreateDescription('');
      setCreateOpen(false);
      setIsSearching(false);
      setSearchTerm('');
      setUiPage(1);
      await loadResources(1);
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to create resource.';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (resource) => {
    setEditingResource(resource);
    setEditName(resource.name);
    setEditDescription(resource.description || '');
    setEditError('');
  };

  const handleEditSave = async () => {
    setEditError('');
    if (!editName.trim()) {
      setEditError('Name is required.');
      return;
    }
    setEditSaving(true);
    try {
      await axiosClient.put(`/resources/${editingResource.id}`, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setEditingResource(null);
      if (isSearching) {
        handleSearchChange({ target: { value: searchTerm } });
      } else {
        await loadResources(uiPage);
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update resource.';
      setEditError(message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteError('');
    setDeleting(true);
    try {
      await axiosClient.delete(`/resources/${deletingResource.id}`);
      setDeletingResource(null);
      if (isSearching) {
        handleSearchChange({ target: { value: searchTerm } });
      } else {
        const isLastItemOnPage = resources.length === 1 && uiPage > 1;
        if (isLastItemOnPage) {
          setUiPage(uiPage - 1);
        } else {
          await loadResources(uiPage);
        }
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete resource.';
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  const startItem = totalElements === 0 ? 0 : (uiPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(uiPage * PAGE_SIZE, totalElements);

  return (
    <div className={styles.app}>
      <Topbar />
      <div className={styles.layout}>
        <Sidebar active="resources" />
        <div className={styles.content}>
          <div className={styles.contentInner}>
            <div className={styles.pageHeader}>
              <div>
                <div className={styles.pageTitle}>Resources</div>
                <div className={styles.pageSubtitle}>
                  Databases, APIs, and services registered to your organization.
                </div>
              </div>
              {canCreate && (
                <button
                  className={styles.btnPrimary}
                  onClick={() => setCreateOpen(!createOpen)}
                >
                  + New resource
                </button>
              )}
            </div>

            {createOpen && (
              <div className={styles.createPanel}>
                <div className={styles.createTitle}>New resource</div>
                {createError && <div className={styles.formError}>{createError}</div>}
                <div className={styles.field} style={{ marginBottom: '16px' }}>
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder="e.g. billing-webhook"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>
                <div className={styles.field} style={{ marginBottom: '16px' }}>
                  <label>Description</label>
                  <textarea
                    rows="2"
                    placeholder="What is this resource used for?"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                  />
                </div>
                <div className={styles.formActions}>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => {
                      setCreateOpen(false);
                      setCreateError('');
                      setCreateName('');
                      setCreateDescription('');
                    }}
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={handleCreate}
                    disabled={creating}
                  >
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            )}

            {canViewList ? (
              <>
                <div className={styles.searchRow}>
                  <input
                    className={styles.searchInput}
                    type="text"
                    placeholder="Search resources by name…"
                    value={searchTerm}
                    onChange={handleSearchChange}
                  />
                </div>

                {error && <div className={styles.formError}>{error}</div>}

                <div className={styles.card}>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Owner</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan="3" className={styles.emptyRow}>
                            Loading…
                          </td>
                        </tr>
                      )}
                      {!loading && resources.length === 0 && (
                        <tr>
                          <td colSpan="3" className={styles.emptyRow}>
                            No resources found.
                          </td>
                        </tr>
                      )}
                      {!loading &&
                        resources.map((resource) => (
                          <tr key={resource.id}>
                            <td>
                              <div className={styles.resName}>{resource.name}</div>
                              {resource.description && (
                                <div className={styles.resDesc}>{resource.description}</div>
                              )}
                            </td>
                            <td className={styles.resOwner}>
                              {ownerMap[resource.ownerUserId] || `User #${resource.ownerUserId}`}
                            </td>
                            <td>
                              <div className={styles.rowActions}>
                                {canUpdate && (
                                  <button
                                    className={styles.iconBtn}
                                    onClick={() => openEdit(resource)}
                                  >
                                    Edit
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    className={`${styles.iconBtn} ${styles.danger}`}
                                    onClick={() => {
                                      setDeletingResource(resource);
                                      setDeleteError('');
                                    }}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {!isSearching && totalElements > 0 && (
                  <div className={styles.pagination}>
                    <div className={styles.paginationInfo}>
                      Showing <b>{startItem}–{endItem}</b> of <b>{totalElements}</b> resources
                    </div>
                    <div className={styles.paginationControls}>
                      <button
                        className={styles.pageBtn}
                        disabled={uiPage === 1}
                        onClick={() => setUiPage(uiPage - 1)}
                      >
                        ‹ Prev
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          className={`${styles.pageBtn} ${p === uiPage ? styles.active : ''}`}
                          onClick={() => setUiPage(p)}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        className={styles.pageBtn}
                        disabled={uiPage === totalPages}
                        onClick={() => setUiPage(uiPage + 1)}
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              canCreate && (
                <div className={styles.card}>
                  <div className={styles.emptyRow}>
                    You don't have permission to view the resource list, but you can still create new resources above.
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {editingResource && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalTitle}>Edit resource</div>
            {editError && <div className={styles.formError}>{editError}</div>}
            <div className={styles.field} style={{ marginBottom: '16px' }}>
              <label>Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className={styles.field} style={{ marginBottom: '16px' }}>
              <label>Description</label>
              <textarea
                rows="2"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className={styles.formActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => setEditingResource(null)}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                onClick={handleEditSave}
                disabled={editSaving}
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingResource && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalTitle}>Delete resource</div>
            {deleteError && <div className={styles.formError}>{deleteError}</div>}
            <p className={styles.modalText}>
              Are you sure you want to delete <b>{deletingResource.name}</b>? This
              cannot be undone.
            </p>
            <div className={styles.formActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => setDeletingResource(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={`${styles.btnPrimary} ${styles.dangerBtn}`}
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Resources;