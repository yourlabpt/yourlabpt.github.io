function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getProjectMember(user, project) {
  if (!user || !project) return null;
  return ensureArray(project.members).find((m) => m.userId === user.id) || null;
}

function getProjectMemberRole(user, project) {
  if (!user || !project) return null;
  if (user.role === 'super_admin') return 'super_admin';
  const member = getProjectMember(user, project);
  return member?.role || null;
}

function canAccessProject(user, project) {
  if (!user || !project) return false;
  if (user.role === 'super_admin') return true;
  return Boolean(getProjectMember(user, project));
}

function canEditProject(user, project) {
  if (!user || !project) return false;
  if (user.role === 'super_admin') return true;
  return getProjectMemberRole(user, project) === 'partner';
}

function isClientViewer(user, project) {
  if (!user || !project) return false;
  if (user.role === 'super_admin') return false;
  if (user.role === 'client') return true;
  return getProjectMemberRole(user, project) === 'client';
}

function createRequireProjectEditor() {
  return function requireProjectEditor(req, res, next) {
    if (!req.auth?.user) {
      return res.status(401).json({ message: 'Nao autenticado.' });
    }
    if (!req.loadedProject) {
      return res.status(400).json({ message: 'Projecto nao carregado.' });
    }
    if (canEditProject(req.auth.user, req.loadedProject)) {
      return next();
    }
    return res.status(403).json({ message: 'Sem permissao para alterar este projecto.' });
  };
}

function createRequireSuperAdminOnlyProjectSettings() {
  return function requireSuperAdminProjectSettings(req, res, next) {
    if (!req.auth?.user) {
      return res.status(401).json({ message: 'Nao autenticado.' });
    }
    if (req.auth.user.role === 'super_admin') {
      return next();
    }
    return res.status(403).json({ message: 'Apenas super admin pode alterar definicoes do projecto.' });
  };
}

function canManageWorkItems(user, project) {
  return canEditProject(user, project);
}

function filterWorkItemsForViewer(items, user, project) {
  const list = ensureArray(items);
  if (canManageWorkItems(user, project)) return list;
  const userId = user?.id;
  if (!userId) return [];
  return list.filter((item) =>
    item.origin === 'human' && item.assigneeUserId === userId
  );
}

function viewerHasAssignedHumanWorkItems(user, project, items) {
  const userId = user?.id;
  if (!userId) return false;
  return ensureArray(items).some((item) =>
    item.origin === 'human' && item.assigneeUserId === userId
  );
}

function canViewWorkItemsTab(user, project, items) {
  if (!canAccessProject(user, project)) return false;
  if (canManageWorkItems(user, project)) return true;
  return viewerHasAssignedHumanWorkItems(user, project, items);
}

function canPostWorkItemUpdate(user, project, item) {
  if (canManageWorkItems(user, project)) return true;
  const userId = user?.id;
  return Boolean(userId && item?.origin === 'human' && item.assigneeUserId === userId);
}

function canEditWorkItemUpdate(user, project) {
  return canManageWorkItems(user, project);
}

const CLIENT_VISIBLE_TABS = new Set(['projetos', 'deliveryos', 'requisitos', 'fases', 'atas', 'documentos']);

module.exports = {
  CLIENT_VISIBLE_TABS,
  getProjectMember,
  getProjectMemberRole,
  canAccessProject,
  canEditProject,
  isClientViewer,
  canManageWorkItems,
  canPostWorkItemUpdate,
  canEditWorkItemUpdate,
  canViewWorkItemsTab,
  filterWorkItemsForViewer,
  viewerHasAssignedHumanWorkItems,
  createRequireProjectEditor,
  createRequireSuperAdminOnlyProjectSettings,
};
