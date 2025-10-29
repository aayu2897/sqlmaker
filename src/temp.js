import React, { useEffect, useState } from 'react';
import './DatabaseDesigner.css';
import {
  Database, Plus, Trash2, Link, Table,
  Download, Save, Upload, Edit3
} from 'lucide-react';

const DEFAULT_FIELD = () => ({
  id: String(Date.now()) + Math.random().toString(36).slice(2),
  name: 'id',
  type: 'INTEGER',
  isPrimary: true,
  isNull: false,
  isUnique: false,
  autoIncrement: true,
  default: ''
});

const DATA_TYPES = [
  'INTEGER', 'BIGINT', 'TEXT', 'VARCHAR(255)',
  'BOOLEAN', 'DATE', 'TIMESTAMP', 'REAL', 'DECIMAL'
];

const REL_TYPES = ['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY'];
const STORAGE_KEY = 'sqlmaker_project_v1';

function uniqueName(base, list) {
  let name = base;
  let i = 1;
  const existing = new Set(list.map(x => x.name.toLowerCase()));
  while (existing.has(name.toLowerCase())) {
    name = `${base}_${i++}`;
  }
  return name;
}

export default function DatabaseDesigner() {
  const [tables, setTables] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [tableDraft, setTableDraft] = useState(null);
  const [showRelModal, setShowRelModal] = useState(false);
  const [relDraft, setRelDraft] = useState(null);
  const [dialect, setDialect] = useState('postgres');
  const [message, setMessage] = useState('');

  // === Load from localStorage ===
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const json = JSON.parse(raw);
      setTables(json.tables || []);
      setRelationships(json.relationships || []);
      setDialect(json.dialect || 'postgres');
    } catch (e) {
      console.warn('Could not parse project data', e);
    }
  }, []);

  // === Persist to localStorage ===
  useEffect(() => {
    const payload = { tables, relationships, dialect };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [tables, relationships, dialect]);

  const resetMessage = (timeout = 2500) => {
    setTimeout(() => setMessage(''), timeout);
  };

  // === Table Operations ===
  const openCreateTable = () => {
    setEditingTable(null);
    setTableDraft({
      name: uniqueName('table', tables),
      fields: [DEFAULT_FIELD()]
    });
    setShowTableModal(true);
  };

  const openEditTable = (tableId) => {
    const t = tables.find(x => x.id === tableId);
    if (!t) return;
    setEditingTable(tableId);
    setTableDraft(JSON.parse(JSON.stringify(t)));
    setShowTableModal(true);
  };

  const saveTable = () => {
    if (!tableDraft.name?.trim()) {
      setMessage('Table name required');
      return resetMessage();
    }

    const nameLower = tableDraft.name.trim().toLowerCase();
    const nameConflict = tables.some(
      t => t.name.trim().toLowerCase() === nameLower && t.id !== editingTable
    );
    if (nameConflict) {
      setMessage('Table name already exists');
      return resetMessage();
    }

    if (!tableDraft.fields?.length) {
      setMessage('At least one field required');
      return resetMessage();
    }

    if (!tableDraft.fields.some(f => f.isPrimary)) {
      setMessage('Primary key required');
      return resetMessage();
    }

    const names = tableDraft.fields.map(f => f.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      setMessage('Duplicate field names');
      return resetMessage();
    }

    if (editingTable) {
      setTables(tables.map(t => t.id === editingTable ? { ...tableDraft, id: editingTable } : t));
      setMessage('Table updated');
    } else {
      const newTable = { ...tableDraft, id: crypto.randomUUID?.() || String(Date.now()) };
      setTables([...tables, newTable]);
      setMessage('Table created');
    }
    setShowTableModal(false);
    resetMessage();
  };

  const deleteTable = (tableId) => {
    const t = tables.find(x => x.id === tableId);
    if (!t) return;
    setTables(tables.filter(x => x.id !== tableId));
    setRelationships(relationships.filter(r =>
      r.parentTableId !== tableId && r.childTableId !== tableId
    ));
    setMessage(`Deleted table "${t.name}" and related relationships`);
    resetMessage();
  };

  const addFieldToDraft = () => {
    setTableDraft({
      ...tableDraft,
      fields: [
        ...tableDraft.fields,
        {
          id: crypto.randomUUID?.() || String(Date.now()),
          name: '',
          type: 'TEXT',
          isPrimary: false,
          isNull: true,
          isUnique: false,
          autoIncrement: false,
          default: ''
        }
      ]
    });
  };

  const updateFieldInDraft = (fieldId, key, value) => {
    setTableDraft({
      ...tableDraft,
      fields: tableDraft.fields.map(f => f.id === fieldId ? { ...f, [key]: value } : f)
    });
  };

  const removeFieldInDraft = (fieldId) => {
    setTableDraft({
      ...tableDraft,
      fields: tableDraft.fields.filter(f => f.id !== fieldId)
    });
  };

  // === Relationship Operations ===
  const openCreateRelationship = () => {
    if (tables.length < 2) {
      setMessage('Need at least two tables');
      return resetMessage();
    }
    setRelDraft({
      parentTableId: tables[0].id,
      childTableId: tables[1].id,
      parentField: '',
      childField: '',
      type: 'ONE_TO_MANY'
    });
    setShowRelModal(true);
  };

  const saveRelationship = () => {
    const { parentTableId, childTableId, type } = relDraft;
    if (!parentTableId || !childTableId || parentTableId === childTableId) {
      setMessage('Invalid parent/child tables');
      return resetMessage();
    }

    const parent = tables.find(t => t.id === parentTableId);
    const child = tables.find(t => t.id === childTableId);
    if (!parent || !child) {
      setMessage('Parent or child table missing');
      return resetMessage();
    }

    if (type === 'MANY_TO_MANY') {
      const joinName = uniqueName(`${parent.name}_${child.name}_join`, tables);
      const joinTable = {
        id: crypto.randomUUID?.() || String(Date.now()),
        name: joinName,
        fields: [
          DEFAULT_FIELD(),
          {
            id: String(Date.now()) + 'a',
            name: `${parent.name.toLowerCase()}_id`,
            type: 'INTEGER',
            isForeignKey: true,
            references: parent.id
          },
          {
            id: String(Date.now()) + 'b',
            name: `${child.name.toLowerCase()}_id`,
            type: 'INTEGER',
            isForeignKey: true,
            references: child.id
          }
        ]
      };

      const newRel = { ...relDraft, id: crypto.randomUUID?.() || String(Date.now()) };
      setTables([...tables, joinTable]);
      setRelationships([...relationships, newRel]);
      setMessage(`Created join table "${joinName}"`);
      setShowRelModal(false);
      return resetMessage();
    }

    const parentPK = parent.fields.find(f => f.isPrimary) || parent.fields[0];
    const fkName = relDraft.childField?.trim() || `${parent.name.toLowerCase()}_id`;
    const childHas = child.fields.some(f => f.name.toLowerCase() === fkName.toLowerCase());
    let updatedChild = { ...child };

    if (!childHas) {
      updatedChild.fields.push({
        id: String(Date.now()),
        name: fkName,
        type: parentPK.type || 'INTEGER',
        isForeignKey: true,
        references: parent.id,
        isUnique: type === 'ONE_TO_ONE',
        isNull: false
      });
    } else if (type === 'ONE_TO_ONE') {
      updatedChild.fields = updatedChild.fields.map(f =>
        f.name.toLowerCase() === fkName.toLowerCase() ? { ...f, isUnique: true } : f
      );
    }

    const newRel = {
      ...relDraft,
      id: crypto.randomUUID?.() || String(Date.now()),
      parentField: parentPK.name,
      childField: fkName
    };

    setTables(tables.map(t => t.id === child.id ? updatedChild : t));
    setRelationships([...relationships, newRel]);
    setShowRelModal(false);
    setMessage('Relationship saved');
    resetMessage();
  };

  const deleteRelationship = (relId) => {
    const rel = relationships.find(r => r.id === relId);
    if (!rel) return;

    if (rel.type === 'MANY_TO_MANY') {
      // remove join table
      const joinTable = tables.find(t =>
        t.fields.some(f => f.isForeignKey && [rel.parentTableId, rel.childTableId].includes(f.references))
      );
      if (joinTable) {
        setTables(tables.filter(t => t.id !== joinTable.id));
      }
      setRelationships(relationships.filter(r => r.id !== relId));
      setMessage('Deleted M:N relationship and join table');
      return resetMessage();
    }

    // For other relationships remove FK
    const child = tables.find(t => t.id === rel.childTableId);
    if (child) {
      const newChild = {
        ...child,
        fields: child.fields.filter(f => !(f.isForeignKey && f.references === rel.parentTableId))
      };
      setTables(tables.map(t => t.id === child.id ? newChild : t));
    }

    setRelationships(relationships.filter(r => r.id !== relId));
    setMessage('Deleted relationship');
    resetMessage();
  };

  // === Export/Import ===
  const exportJSON = () => {
    const blob = new Blob(
      [JSON.stringify({ tables, relationships, dialect }, null, 2)],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sqlmaker_project.json';
    a.click();
  };

  const importJSON = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.tables)) throw new Error('Invalid file');
        setTables(data.tables);
        setRelationships(data.relationships || []);
        setDialect(data.dialect || 'postgres');
        setMessage('Project imported');
      } catch (err) {
        setMessage('Import failed: ' + err.message);
      }
      resetMessage();
    };
    reader.readAsText(file);
  };

  // === SQL Generation ===
  const generateSQL = (forDialect = dialect) => {
    const escapeId = (n) => (forDialect === 'mysql' ? `\`${n}\`` : `"${n}"`);
    const lines = [`-- Generated by SQLMaker`, `-- Dialect: ${forDialect}`, ``];

    tables.forEach(t => {
      lines.push(`CREATE TABLE ${escapeId(t.name)} (`);
      const defs = [];

      t.fields.forEach(f => {
        const parts = [`${escapeId(f.name)} ${f.type}`];
        if (f.isPrimary) parts.push('PRIMARY KEY');
        if (!f.isNull && !f.isPrimary) parts.push('NOT NULL');
        if (f.isUnique) parts.push('UNIQUE');
        if (f.default) parts.push(`DEFAULT '${f.default}'`);
        defs.push('  ' + parts.join(' '));
      });

      t.fields.filter(f => f.isForeignKey && f.references).forEach(fk => {
        const parent = tables.find(tt => tt.id === fk.references);
        if (parent) {
          const pk = parent.fields.find(p => p.isPrimary)?.name || 'id';
          defs.push(`  ,FOREIGN KEY (${escapeId(fk.name)}) REFERENCES ${escapeId(parent.name)}(${escapeId(pk)})`);
        }
      });

      lines.push(defs.join(',\n'));
      lines.push(');\n');
    });

    return lines.join('\n');
  };

  // === Render ===
  const getTableById = (id) => tables.find(t => t.id === id);
  const renderRelationships = () => {
    if (!relationships.length) return <div className="empty">No relationships yet</div>;
    return (
      <ul className="rel-list">
        {relationships.map(r => {
          const p = getTableById(r.parentTableId);
          const c = getTableById(r.childTableId);
          return (
            <li key={r.id} className="rel-item">
              <strong>{p?.name || '—'}</strong> → <strong>{c?.name || '—'}</strong>
              <span className="rel-type">{r.type}</span>
              <div className="rel-actions">
                <button className="btn small red" onClick={() => deleteRelationship(r.id)} title="Delete"><Trash2 /></button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  // === JSX ===
  return (
    <div className="db-designer">
      {/* Topbar */}
      <div className="topbar">
        <div className="brand"><Database /> <span>SQLMaker</span></div>
        <div className="top-actions">
          <select value={dialect} onChange={e => setDialect(e.target.value)}>
            <option value="postgres">Postgres</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite</option>
          </select>
          <button className="btn" onClick={openCreateTable}><Plus /> Table</button>
          <button className="btn" onClick={openCreateRelationship}><Link /> Relationship</button>
          <label className="btn file-btn">
            <Upload /> Import
            <input type="file" accept=".json" onChange={e => importJSON(e.target.files?.[0])} />
          </label>
          <button className="btn" onClick={exportJSON}><Save /> Export</button>
          <button className="btn" onClick={() => {
            const blob = new Blob([generateSQL()], { type: 'text/sql' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'schema.sql';
            a.click();
          }}><Download /> SQL</button>
        </div>
      </div>

      {/* Layout */}
      <div className="layout">
        {/* Left: Tables */}
        <div className="left-panel">
          <div className="panel-header">
            <h3><Table /> Tables ({tables.length})</h3>
            <button className="btn small" onClick={openCreateTable}>Add</button>
          </div>
          <div className="tables-list">
            {tables.length === 0 && <div className="empty">No tables yet</div>}
            {tables.map(t => (
              <div className="table-card" key={t.id}>
                <div className="table-card-top">
                  <strong>{t.name}</strong>
                  <div className="table-meta">{t.fields.length} fields</div>
                  <div className="table-card-actions">
                    <button className="btn small" onClick={() => openEditTable(t.id)}><Edit3 /></button>
                    <button className="btn small red" onClick={() => deleteTable(t.id)}><Trash2 /></button>
                  </div>
                </div>
                <ul className="field-list-compact">
                  {t.fields.map(f => (
                    <li key={f.id}>
                      <span>{f.name}</span> <span>{f.type}</span>
                      {f.isPrimary && <span className="flag pk">PK</span>}
                      {f.isForeignKey && <span className="flag fk">FK</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Relationships + SQL */}
        <div className="right-panel">
          <div className="panel">
            <div className="panel-header"><h3><Link /> Relationships</h3></div>
            <div className="panel-body">{renderRelationships()}</div>
          </div>
          <div className="panel">
            <div className="panel-header">
              <h3><Database /> SQL</h3>
              <button className="btn small" onClick={() => {
                navigator.clipboard.writeText(generateSQL());
                setMessage('SQL copied');
                resetMessage();
              }}>Copy</button>
            </div>
            <pre className="sql-output">{generateSQL()}</pre>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showTableModal && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <h2>{editingTable ? 'Edit Table' : 'New Table'}</h2>
              <button className="btn" onClick={() => setShowTableModal(false)}>Close</button>
            </div>
            <div className="modal-body">
              <label>Table name</label>
              <input 
                value={tableDraft.name}
                onChange={(e) => setTableDraft({ ...tableDraft, name: e.target.value })}
              />

              <div className="fields-area">
                <div className="fields-header">
                  <h4>Fields</h4>
                  <button className="btn small" onClick={addFieldToDraft}>
                    <Plus /> Add Field
                  </button>
                </div>

                {tableDraft.fields.map((f) => (
                  <div key={f.id} className="field-row">
                    <input
                      className="field-name"
                      value={f.name}
                      placeholder="name"
                      onChange={(e) => updateFieldInDraft(f.id, 'name', e.target.value)}
                    />
                    <select
                      value={f.type}
                      onChange={(e) => updateFieldInDraft(f.id, 'type', e.target.value)}
                    >
                      {DATA_TYPES.map((dt) => (
                        <option key={dt} value={dt}>
                          {dt}
                        </option>
                      ))}
                    </select>

                    <label className="small-label">
                      <input
                        type="checkbox"
                        checked={!!f.isPrimary}
                        onChange={(e) => updateFieldInDraft(f.id, 'isPrimary', e.target.checked)}
                      />{' '}
                      PK
                    </label>

                    <label className="small-label">
                      <input
                        type="checkbox"
                        checked={!f.isNull}
                        onChange={(e) => updateFieldInDraft(f.id, 'isNull', !e.target.checked)}
                      />{' '}
                      Required
                    </label>

                    <label className="small-label">
                      <input
                        type="checkbox"
                        checked={!!f.isUnique}
                        onChange={(e) => updateFieldInDraft(f.id, 'isUnique', e.target.checked)}
                      />{' '}
                      Unique
                    </label>

                    <label className="small-label">
                      <input
                        type="checkbox"
                        checked={!!f.autoIncrement}
                        onChange={(e) =>
                          updateFieldInDraft(f.id, 'autoIncrement', e.target.checked)
                        }
                      />{' '}
                      Auto
                    </label>

                    <input
                      className="field-default"
                      placeholder="default"
                      value={f.default || ''}
                      onChange={(e) => updateFieldInDraft(f.id, 'default', e.target.value)}
                    />

                    <button
                      className="btn small red"
                      title="Remove Field"
                      onClick={() => removeFieldInDraft(f.id)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn green" onClick={saveTable}>
                <Save /> Save
              </button>
              <button
                className="btn gray"
                onClick={() => {
                  setShowTableModal(false);
                  setTableDraft(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showRelModal && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Add Relationship</h2>
              <button
                className="btn"
                onClick={() => {
                  setShowRelModal(false);
                  setRelDraft(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="modal-body">
              <label>Relationship type</label>
              <select
                value={relDraft.type}
                onChange={(e) => setRelDraft({ ...relDraft, type: e.target.value })}
              >
                {REL_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <label>Parent table (source)</label>
              <select
                value={relDraft.parentTableId}
                onChange={(e) => setRelDraft({ ...relDraft, parentTableId: e.target.value })}
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <label>Child table (target)</label>
              <select
                value={relDraft.childTableId}
                onChange={(e) => setRelDraft({ ...relDraft, childTableId: e.target.value })}
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <label>Child FK field name (optional)</label>
              <input
                value={relDraft.childField || ''}
                onChange={(e) => setRelDraft({ ...relDraft, childField: e.target.value })}
                placeholder="e.g. user_id"
              />
            </div>

            <div className="modal-footer">
              <button className="btn green" onClick={saveRelationship}>
                <Save /> Save
              </button>
              <button
                className="btn gray"
                onClick={() => {
                  setShowRelModal(false);
                  setRelDraft(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="statusbar">
        <div className="status-left">{message}</div>
        <div className="status-right">
          Tables: {tables.length} • Relationships: {relationships.length}
        </div>
      </div>
    </div>
  );
}
