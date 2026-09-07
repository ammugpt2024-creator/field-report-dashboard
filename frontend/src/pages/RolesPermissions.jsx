import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Plus, Trash2, Copy, Save, Loader2, AlertCircle, Check, X, Search
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { listRoles, createRole, updateRole, deleteRole } from "../services/tenantService";

// The tools a role can grant access to. Deliberately the same four keys the rest
// of the app enforces (utils/moduleAccess.MODULE_KEYS) — listing anything else
// here would promise access control that nothing actually applies.
const TOOLS = [
  { key: "daily_logs", label: "Daily Logs", blurb: "Site daily reports, activities, and sign-off" },
  { key: "timesheets", label: "Timesheets", blurb: "Weekly time cards and approvals" },
  { key: "field_test_reports", label: "Field Test Reports", blurb: "Concrete and field test records" },
  { key: "lab_reports", label: "Lab Reports", blurb: "Laboratory results and verification" }
];

// Procore-style ladder. "approve" is a legacy value that still ranks below
// manage for enforcement; it is shown and saved as Admin.
const LEVELS = [
  { value: "none", label: "None", hint: "No access — the tool is hidden" },
  { value: "view", label: "Read Only", hint: "Can open and read records" },
  { value: "create_edit", label: "Standard", hint: "Can create, edit, and submit their own records" },
  { value: "manage", label: "Admin", hint: "Full control — see all, approve or return, manage" }
];

const normalize = (v) => (v === "approve" ? "manage" : v || "none");
const levelLabel = (v) => LEVELS.find((l) => l.value === normalize(v))?.label || "None";
const fullPerms = (partial = {}) =>
  TOOLS.reduce((acc, t) => ({ ...acc, [t.key]: normalize(partial[t.key]) }), {});
const emptyDraft = () => ({ id: null, name: "", description: "", permissions: fullPerms(), is_system: false });
const samePerms = (a, b) => TOOLS.every((t) => normalize(a?.[t.key]) === normalize(b?.[t.key]));

function summarize(perms = {}) {
  const on = TOOLS.filter((t) => normalize(perms[t.key]) !== "none");
  if (!on.length) return "No tool access";
  return on.map((t) => `${t.label}: ${levelLabel(perms[t.key])}`).join(" · ");
}

const LEVEL_PILL = {
  none: "bg-slate-100 text-slate-500",
  view: "bg-sky-50 text-sky-700",
  create_edit: "bg-emerald-50 text-emerald-700",
  manage: "bg-violet-50 text-violet-700"
};

function RolesPermissions() {
  const { companyRole, isPlatformAdmin, companyId } = useAuth();
  const canManage = companyRole === "company_admin" || isPlatformAdmin;

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft());

  // Applying the rows is kept separate from fetching them so that nothing sets
  // state before the first await inside the mount effect — doing so trips the
  // cascading-render rule.
  const applyRows = useCallback((rows, keepId) => {
    setRoles(rows);
    const keep = rows.find((r) => r.id === keepId) || rows[0] || null;
    if (keep) {
      setSelectedId(keep.id);
      setDraft({ ...keep, permissions: fullPerms(keep.permissions) });
    } else {
      setSelectedId(null);
      setDraft(emptyDraft());
    }
    setLoading(false);
  }, []);

  // Reload after a save or delete, keeping the edited role selected.
  const refresh = useCallback(async (keepId) => {
    applyRows(await listRoles(), keepId);
  }, [applyRows]);

  useEffect(() => {
    let active = true;
    (async () => {
      const rows = await listRoles();
      if (active) applyRows(rows);
    })();
    return () => { active = false; };
  }, [applyRows]);

  const selected = roles.find((r) => r.id === selectedId) || null;
  const isNew = !draft.id;
  const dirty = isNew
    ? Boolean(draft.name.trim())
    : Boolean(selected) && (
      draft.name !== selected.name ||
      (draft.description || "") !== (selected.description || "") ||
      !samePerms(draft.permissions, selected.permissions)
    );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) =>
      r.name.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q));
  }, [roles, query]);

  function pick(role) {
    if (dirty && !window.confirm("Discard unsaved changes to this role?")) return;
    setError(""); setNotice("");
    setSelectedId(role.id);
    setDraft({ ...role, permissions: fullPerms(role.permissions) });
  }

  function startNew() {
    if (dirty && !window.confirm("Discard unsaved changes to this role?")) return;
    setError(""); setNotice("");
    setSelectedId(null);
    setDraft(emptyDraft());
  }

  function duplicate() {
    setError(""); setNotice("");
    setSelectedId(null);
    setDraft({
      id: null,
      name: `${draft.name} (copy)`,
      description: draft.description,
      permissions: fullPerms(draft.permissions),
      is_system: false
    });
  }

  function setLevel(toolKey, value) {
    setDraft((d) => ({ ...d, permissions: { ...d.permissions, [toolKey]: value } }));
  }

  function setAll(value) {
    setDraft((d) => ({ ...d, permissions: fullPerms(TOOLS.reduce((a, t) => ({ ...a, [t.key]: value }), {})) }));
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) { setError("Give the role a name."); return; }
    if (roles.some((r) => r.id !== draft.id && r.name.trim().toLowerCase() === name.toLowerCase())) {
      setError("Another role already uses that name."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = { name, description: draft.description || "", permissions: fullPerms(draft.permissions) };
      if (draft.id) {
        await updateRole(companyId, draft.id, payload);
        await refresh(draft.id);
        setNotice("Role saved.");
      } else {
        const created = await createRole(companyId, payload);
        await refresh(created?.id);
        setNotice("Role created.");
      }
    } catch (err) {
      setError(err.message || "The role could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id || draft.is_system) return;
    if (!window.confirm(
      `Delete the role "${draft.name}"?\n\nPeople already assigned to projects keep the access they were given — this only removes the template.`
    )) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await deleteRole(companyId, draft.id);
      await refresh();
      setNotice("Role deleted.");
    } catch (err) {
      setError(err.message || "The role could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b-4 border-accent-500 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[0.14em]">Access Control</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Roles &amp; Permissions</h1>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Templates that decide what each person can do in every tool. Apply one when adding someone to a project — you can still override it per project.
              </p>
            </div>
            {canManage && (
              <button
                type="button" onClick={startNew}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/20"
              >
                <Plus className="h-4 w-4" /> New role
              </button>
            )}
          </div>
        </div>

        {!canManage && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 sm:px-7">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">
              You can review roles here, but only a company admin can change them.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading roles…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-[320px_1fr]">
            {/* Role list */}
            <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
              <div className="p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search roles…"
                    className="min-h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              <div className="max-h-[560px] overflow-y-auto pb-2">
                {filtered.map((role) => {
                  const active = role.id === selectedId && !isNew;
                  return (
                    <button
                      key={role.id} type="button" onClick={() => pick(role)}
                      className={`block w-full border-l-4 px-4 py-3 text-left transition ${
                        active ? "border-accent-500 bg-blue-50/60" : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-slate-900">{role.name}</span>
                        {role.is_system && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Default</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{summarize(role.permissions)}</p>
                    </button>
                  );
                })}
                {!filtered.length && (
                  <p className="px-4 py-6 text-sm font-semibold text-slate-500">
                    {roles.length ? "No roles match that search." : "No roles yet — create your first one."}
                  </p>
                )}
                {isNew && (
                  <div className="border-l-4 border-accent-500 bg-blue-50/60 px-4 py-3">
                    <p className="text-sm font-bold text-slate-900">{draft.name.trim() || "New role"}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500">Unsaved</p>
                  </div>
                )}
              </div>
            </aside>

            {/* Editor */}
            <div className="p-5 sm:p-7">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="role-name" className="text-xs font-bold uppercase tracking-wide text-slate-500">Role name</label>
                  <input
                    id="role-name" value={draft.name} disabled={!canManage || busy}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Senior Field Inspector"
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label htmlFor="role-desc" className="text-xs font-bold uppercase tracking-wide text-slate-500">Description</label>
                  <input
                    id="role-desc" value={draft.description || ""} disabled={!canManage || busy}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="What this role is for"
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">Tool permissions</h2>
                {canManage && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-400">Set all:</span>
                    {LEVELS.map((l) => (
                      <button
                        key={l.value} type="button" disabled={busy} onClick={() => setAll(l.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-blue-400 hover:text-blue-700"
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Tool</th>
                      {LEVELS.map((l) => (
                        <th key={l.value} className="px-3 py-3 text-center">
                          <div className="text-xs font-bold text-slate-700">{l.label}</div>
                          <div className="mx-auto mt-0.5 max-w-[130px] text-[11px] font-medium leading-4 text-slate-400">{l.hint}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TOOLS.map((tool) => (
                      <tr key={tool.key} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold text-slate-900">{tool.label}</p>
                          <p className="text-xs font-medium text-slate-400">{tool.blurb}</p>
                        </td>
                        {LEVELS.map((l) => {
                          const on = normalize(draft.permissions[tool.key]) === l.value;
                          return (
                            <td key={l.value} className="px-3 py-3 text-center">
                              <input
                                type="radio"
                                name={`perm-${tool.key}`}
                                checked={on}
                                disabled={!canManage || busy}
                                onChange={() => setLevel(tool.key, l.value)}
                                aria-label={`${tool.label}: ${l.label}`}
                                className="h-4 w-4 cursor-pointer accent-blue-700 disabled:cursor-not-allowed"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-xs font-medium text-slate-400">
                Company admins and platform admins are never limited by these templates — they always have full access.
              </p>

              {error && (
                <p className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  <X className="h-4 w-4" /> {error}
                </p>
              )}
              {notice && !error && (
                <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                  <Check className="h-4 w-4" /> {notice}
                </p>
              )}

              {canManage && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button" onClick={save} disabled={busy || !dirty}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isNew ? "Create role" : "Save changes"}
                  </button>
                  {!isNew && (
                    <button
                      type="button" onClick={duplicate} disabled={busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Copy className="h-4 w-4" /> Duplicate
                    </button>
                  )}
                  {!isNew && !draft.is_system && (
                    <button
                      type="button" onClick={remove} disabled={busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  )}
                  {dirty && <span className="text-xs font-bold text-amber-600">Unsaved changes</span>}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* At-a-glance comparison of every role */}
      {!loading && roles.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-7">
            <h2 className="text-sm font-bold text-slate-900">All roles at a glance</h2>
            <p className="text-xs font-medium text-slate-400">Compare what every role can do across the four tools.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Role</th>
                  {TOOLS.map((t) => (
                    <th key={t.key} className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500">{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{role.name}</span>
                        {role.is_system && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Default</span>
                        )}
                      </div>
                      {role.description && <p className="text-xs font-medium text-slate-400">{role.description}</p>}
                    </td>
                    {TOOLS.map((t) => {
                      const lvl = normalize(role.permissions?.[t.key]);
                      return (
                        <td key={t.key} className="px-3 py-3 text-center">
                          <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${LEVEL_PILL[lvl]}`}>
                            {levelLabel(lvl)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default RolesPermissions;
