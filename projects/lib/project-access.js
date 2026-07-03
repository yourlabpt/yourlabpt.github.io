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

const CLIENT_VISIBLE_TABS = new Set(['projetos', 'deliveryos', 'requisitos', 'fases', 'atas', 'documentos']);

module.exports = {
  CLIENT_VISIBLE_TABS,
  getProjectMember,
  getProjectMemberRole,
  canAccessProject,
  canEditProject,
  isClientViewer,
  createRequireProjectEditor,
  createRequireSuperAdminOnlyProjectSettings,
};
