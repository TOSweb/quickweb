// src/admin/router.js
import { loginPage, handleLogin, setupPage, handleSetup, handleLogout } from "./auth.js";
import { dashboardPage } from "./dashboard.js";
import { settingsPage, saveSettings, saveSeoSettings, saveHostingSettings } from "./settings.js";
import {
  pagesList, newPagePage, handleNewPage, pageEditor, handleAddComponent, handleRemoveComponent, handleToggleStatus
} from "./pages.js";
import {
  componentsList, newComponentPage, handleNewComponent, handleToggleGlobal, handleDeleteComponent, handleUpdateContent
} from "./components.js";
import { importComponentPage, handleImportComponent } from "./importer.js";
import {
  componentTemplatesList, editComponentTemplate, handleSaveTemplate, handleCreateTemplate
} from "./developer.js";
import {
  usersList, newUserPage, handleNewUser, editUserPage, handleEditUser,
  groupsList, newGroupPage, handleNewGroup, editGroupPage, handleEditGroup,
} from "./users.js";
import {
  blogList, newPostPage, handleNewPost, editPostPage, handleEditPost, handleDeletePost,
  categoriesList, newCategoryPage, handleNewCategory, editCategoryPage, handleEditCategory, handleDeleteCategory,
} from "./blog.js";
import { redirectsList, handleNewRedirect, handleDeleteRedirect } from "./redirects.js";
import { mediaLibrary, handleUpload, handleDeleteMedia } from "./media.js";
import { pluginsList, handlePluginUpload, handleDeletePlugin } from "./plugins.js";
import { makeContentTypeHandlers } from "./content-type.js";
import { getContentTypes } from "../core/plugins.js";
import { requireAuth } from "../core/auth.js";
import { adminHTML } from "./base.js";

// Lazily built on first request after loadPlugins() has run
let _ctHandlers = null;
function getCtHandlers() {
  if (_ctHandlers) return _ctHandlers;
  _ctHandlers = new Map();
  for (const typeDef of getContentTypes()) {
    _ctHandlers.set(typeDef.slug, makeContentTypeHandlers(typeDef));
  }
  return _ctHandlers;
}

export async function adminRouter(req, path) {
  const method = req.method;

  // Auth routes
  if (path === "/admin/setup") {
    if (method === "GET") return setupPage(req);
    if (method === "POST") return handleSetup(req);
  }
  if (path === "/admin/login") {
    if (method === "GET") return loginPage(req);
    if (method === "POST") return handleLogin(req);
  }
  if (path === "/admin/logout") return handleLogout(req);

  // Pages
  if (path === "/admin/pages") return pagesList(req, {});
  if (path === "/admin/pages/new") {
    if (method === "GET") return newPagePage(req, {});
    if (method === "POST") return handleNewPage(req, {});
  }
  const editPageMatch = path.match(/^\/admin\/pages\/edit\/(\d+)$/);
  if (editPageMatch) return pageEditor(req, { id: editPageMatch[1] });

  const togglePageMatch = path.match(/^\/admin\/pages\/toggle-status\/(\d+)$/);
  if (togglePageMatch && method === "POST") return handleToggleStatus(req, { id: togglePageMatch[1] });

  const addCompMatch = path.match(/^\/admin\/pages\/add-component\/(\d+)$/);
  if (addCompMatch && method === "POST") return handleAddComponent(req, { id: addCompMatch[1] });
  const removeCompMatch = path.match(/^\/admin\/pages\/remove-component\/(\d+)$/);
  if (removeCompMatch && method === "POST") return handleRemoveComponent(req, { id: removeCompMatch[1] });

  // Components
  if (path === "/admin/components/import") {
    if (method === "GET") return importComponentPage(req, {});
    if (method === "POST") return handleImportComponent(req, {});
  }
  if (path === "/admin/components") return componentsList(req, {});
  if (path === "/admin/components/new") {
    if (method === "GET") return newComponentPage(req, {});
    if (method === "POST") return handleNewComponent(req, {});
  }
  const deleteCompMatch = path.match(/^\/admin\/components\/delete\/(\d+)$/);
  if (deleteCompMatch) return handleDeleteComponent(req, { id: deleteCompMatch[1] });
  const updateCompMatch = path.match(/^\/admin\/api\/components\/update\/(\d+)$/);
  if (updateCompMatch) return handleUpdateContent(req, { id: updateCompMatch[1] });
  const toggleGlobalMatch = path.match(/^\/admin\/api\/components\/toggle-global\/(\d+)$/);
  if (toggleGlobalMatch) return handleToggleGlobal(req, { id: toggleGlobalMatch[1] });

  // Developer
  if (path === "/admin/developer/components") return componentTemplatesList(req, {});
  if (path === "/admin/developer/components/new" && method === "POST") return handleCreateTemplate(req, {});
  const devEditMatch = path.match(/^\/admin\/developer\/components\/edit\/([^/]+)$/);
  if (devEditMatch) {
    if (method === "GET") return editComponentTemplate(req, { name: devEditMatch[1] });
    if (method === "POST") return handleSaveTemplate(req, { name: devEditMatch[1] });
  }

  // Blog — categories before posts so /categories/* routes aren't caught by /:id/edit
  if (path === "/admin/blog/categories") return categoriesList(req, {});
  if (path === "/admin/blog/categories/new") {
    if (method === "GET") return newCategoryPage(req, {});
    if (method === "POST") return handleNewCategory(req, {});
  }
  const editCatMatch = path.match(/^\/admin\/blog\/categories\/(\d+)\/edit$/);
  if (editCatMatch) {
    if (method === "GET") return editCategoryPage(req, { id: editCatMatch[1] });
    if (method === "POST") return handleEditCategory(req, { id: editCatMatch[1] });
  }
  const deleteCatMatch = path.match(/^\/admin\/blog\/categories\/(\d+)\/delete$/);
  if (deleteCatMatch && method === "POST") return handleDeleteCategory(req, { id: deleteCatMatch[1] });

  if (path === "/admin/blog" || path === "/admin/blog/") return blogList(req, {});
  if (path === "/admin/blog/new") {
    if (method === "GET") return newPostPage(req, {});
    if (method === "POST") return handleNewPost(req, {});
  }
  const editPostMatch = path.match(/^\/admin\/blog\/(\d+)\/edit$/);
  if (editPostMatch) {
    if (method === "GET") return editPostPage(req, { id: editPostMatch[1] });
    if (method === "POST") return handleEditPost(req, { id: editPostMatch[1] });
  }
  const deletePostMatch = path.match(/^\/admin\/blog\/(\d+)\/delete$/);
  if (deletePostMatch && method === "POST") return handleDeletePost(req, { id: deletePostMatch[1] });

  // Users
  if (path === "/admin/users") return usersList(req, {});
  if (path === "/admin/users/new") {
    if (method === "GET") return newUserPage(req, {});
    if (method === "POST") return handleNewUser(req, {});
  }
  const editUserMatch = path.match(/^\/admin\/users\/(\d+)\/edit$/);
  if (editUserMatch) {
    if (method === "GET") return editUserPage(req, { id: editUserMatch[1] });
    if (method === "POST") return handleEditUser(req, { id: editUserMatch[1] });
  }

  // Groups
  if (path === "/admin/groups") return groupsList(req, {});
  if (path === "/admin/groups/new") {
    if (method === "GET") return newGroupPage(req, {});
    if (method === "POST") return handleNewGroup(req, {});
  }
  const editGroupMatch = path.match(/^\/admin\/groups\/(\d+)\/edit$/);
  if (editGroupMatch) {
    if (method === "GET") return editGroupPage(req, { id: editGroupMatch[1] });
    if (method === "POST") return handleEditGroup(req, { id: editGroupMatch[1] });
  }

  // Redirects
  if (path === "/admin/redirects") return redirectsList(req, {});
  if (path === "/admin/redirects/new" && method === "POST") return handleNewRedirect(req, {});
  const deleteRedirectMatch = path.match(/^\/admin\/redirects\/(\d+)\/delete$/);
  if (deleteRedirectMatch && method === "POST") return handleDeleteRedirect(req, { id: deleteRedirectMatch[1] });

  // Settings & Dashboard
  if (path === "/admin/settings") {
    if (method === "GET") return settingsPage(req, {});
    if (method === "POST") return saveSettings(req, {});
  }
  if (path === "/admin/settings/seo" && method === "POST") return saveSeoSettings(req, {});
  if (path === "/admin/settings/hosting" && method === "POST") return saveHostingSettings(req, {});
  if (path === "/admin" || path === "/admin/") return dashboardPage(req, {});

  // Media
  if (path === "/admin/media") return mediaLibrary(req, {});
  if (path === "/admin/media/upload" && method === "POST") return handleUpload(req, {});
  const deleteMediaMatch = path.match(/^\/admin\/media\/(\d+)\/delete$/);
  if (deleteMediaMatch && method === "POST") return handleDeleteMedia(req, { id: deleteMediaMatch[1] });

  // Plugins
  if (path === "/admin/plugins") return pluginsList(req, {});
  if (path === "/admin/plugins/upload" && method === "POST") return handlePluginUpload(req, {});
  const deletePluginMatch = path.match(/^\/admin\/plugins\/([^/]+)\/delete$/);
  if (deletePluginMatch && method === "POST") return handleDeletePlugin(req, { folder: deletePluginMatch[1] });

  // Dynamic content types (registered by plugins via addContentType)
  const ctHandlers = getCtHandlers();
  for (const [slug, h] of ctHandlers) {
    if (path === `/admin/${slug}`) return h.list(req, {});
    if (path === `/admin/${slug}/new`) {
      if (method === "GET") return h.newItem(req, {});
      if (method === "POST") return h.handleNew(req, {});
    }
    const editMatch = path.match(new RegExp(`^/admin/${slug}/(\\d+)/edit$`));
    if (editMatch) {
      if (method === "GET") return h.editItem(req, { id: editMatch[1] });
      if (method === "POST") return h.handleEdit(req, { id: editMatch[1] });
    }
    const deleteMatch = path.match(new RegExp(`^/admin/${slug}/(\\d+)/delete$`));
    if (deleteMatch && method === "POST") return h.handleDelete(req, { id: deleteMatch[1] });
  }

  return new Response("Admin route not found", { status: 404 });
}
