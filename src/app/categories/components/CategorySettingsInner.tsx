'use client';

import React, { useState, useEffect } from 'react';
import {
  getCategories,
  addCategory,
  saveCategories,
  deleteCategory,
  type Category,
} from '@/lib/storage';
import { Plus, Trash2, Tag, Edit2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';

type TabType = 'expense' | 'income';

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

const PRESET_ICONS = [
  '🍽️',
  '🚗',
  '🛍️',
  '🎬',
  '💡',
  '🏥',
  '🛒',
  '⛽',
  '🏠',
  '📈',
  '📚',
  '📦',
  '💼',
  '💻',
  '🏢',
  '💹',
  '🏘️',
  '🎁',
  '💰',
  '✈️',
  '🎮',
  '🐾',
  '👗',
  '💊',
  '🍕',
  '☕',
  '🎵',
  '🏋️',
  '📱',
  '🔧',
];

export function CategorySettingsInner() {
  const [activeTab, setActiveTab] = useState<TabType>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showIcons, setShowIcons] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState(PRESET_ICONS[0]);

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);
  const [editIcon, setEditIcon] = useState(PRESET_ICONS[0]);

  useEffect(() => {
    setCategories(getCategories());
    const stored = localStorage.getItem('wealthiq_show_category_icons');
    if (stored !== null) {
      setShowIcons(stored === 'true');
    }
  }, []);

  function handleToggleIcons(val: boolean) {
    setShowIcons(val);
    localStorage.setItem('wealthiq_show_category_icons', String(val));
    window.dispatchEvent(new Event('storage'));
  }

  function handleStartEdit(cat: Category) {
    setEditingCategory(cat);
    setEditName(cat.name);
    setEditColor(cat.color || PRESET_COLORS[0]);
    setEditIcon(cat.icon || PRESET_ICONS[0]);
  }

  function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCategory || !editName.trim()) return;

    const allCats = getCategories();
    const updated = allCats.map((c) => {
      if (c.id === editingCategory.id) {
        return {
          ...c,
          name: editName.trim(),
          color: editColor,
          icon: editIcon,
        };
      }
      return c;
    });

    saveCategories(updated);
    setCategories(updated);
    setEditingCategory(null);
    toast.success('Category updated successfully.');
  }

  const filtered = categories.filter((c) => c.type === activeTab);

  function handleAdd() {
    if (!name.trim()) return;
    const newCat = addCategory({ name: name.trim(), type: activeTab, color, icon });
    setCategories((prev) => [...prev, newCat]);
    setName('');
    setColor(PRESET_COLORS[0]);
    setIcon(PRESET_ICONS[0]);
    setShowForm(false);
  }

  function handleDelete(id: string) {
    deleteCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your expense and income categories
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <Plus size={16} />
          Add Category
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="text-base font-semibold text-foreground mb-4">New Category</h2>

          {/* Type toggle inside form */}
          <div className="flex gap-1 bg-muted/30 rounded-xl p-1 mb-4 w-fit">
            {(['expense', 'income'] as TabType[]).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === t
                    ? 'bg-card shadow border border-border text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Category Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Pet Care, Subscriptions..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all"
            />
          </div>

          {/* Color picker */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c
                      ? 'ring-2 ring-offset-2 ring-offset-card ring-white scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview + Actions */}
          <div className="flex items-center gap-4">
            {/* Preview */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/10">
              {showIcons && (
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}
              <span className="text-sm font-medium text-foreground">{name || 'Category Name'}</span>
            </div>

            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground border border-border hover:text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!name.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Save Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex gap-1.5 bg-background/40 border border-border rounded-xl p-1 w-fit">
          {(['expense', 'income'] as TabType[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === t
                  ? 'bg-primary/10 text-primary border border-primary/25 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span
                className={`ml-1.5 text-xs ${
                  activeTab === t ? 'text-primary/80 font-bold' : 'text-muted-foreground'
                }`}
              >
                ({categories.filter((c) => c.type === t).length})
              </span>
            </button>
          ))}
        </div>

        {/* Global Preference Toggle */}
        <label className="flex items-center gap-2 cursor-pointer hover:text-foreground transition select-none text-sm text-muted-foreground font-semibold">
          <input
            type="checkbox"
            checked={showIcons}
            onChange={(e) => handleToggleIcons(e.target.checked)}
            className="rounded border-border text-primary bg-[#0b0f1a] h-4 w-4 focus:ring-offset-background focus:ring-1 focus:ring-primary"
          />
          Show Category Icons
        </label>
      </div>

      {/* Category Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-3">
            <Tag size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No {activeTab} categories yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-primary hover:underline mt-1 inline-block"
          >
            Add your first one →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((cat) => (
            <div
              key={cat.id}
              className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3 group hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />

                {/* Name */}
                <p className="text-sm font-semibold text-foreground truncate">{cat.name}</p>
              </div>

              {/* Actions container (edit + delete) */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0">
                {/* Edit */}
                <button
                  onClick={() => handleStartEdit(cat)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                  title="Edit category"
                >
                  <Edit2 size={13} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-negative hover:bg-negative/10 transition-all"
                  title="Delete category"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <Modal
          isOpen={!!editingCategory}
          onClose={() => setEditingCategory(null)}
          title="Edit Category"
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Category Name *
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                placeholder="e.g. Entertainment, Utilities"
                className="w-full rounded-lg border border-border bg-[#0b0f1a] p-2.5 text-sm text-slate-200 focus:outline-none focus:border-primary transition-all font-medium"
              />
            </div>

            {/* Color picker */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Color</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${
                      editColor === c
                        ? 'ring-2 ring-offset-2 ring-offset-card ring-white scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Icon picker */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Icon</label>
              <div className="grid grid-cols-8 gap-2 max-h-36 overflow-y-auto p-1 bg-[#0b0f1a] border border-border rounded-lg">
                {PRESET_ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setEditIcon(i)}
                    className={`h-9 rounded-lg flex items-center justify-center text-lg hover:bg-muted/50 transition-all ${
                      editIcon === i
                        ? 'bg-primary/20 border border-primary/45 font-bold scale-105'
                        : ''
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/10 w-fit">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 bg-background/50 border border-border"
                style={{ borderColor: `${editColor}40` }}
              >
                {editIcon}
              </div>
              <span className="text-sm font-medium text-foreground">
                {editName || 'Category Name'}
              </span>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 border border-border bg-[#0b0f1a] hover:bg-muted text-xs font-semibold text-foreground rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-xs font-semibold text-primary-foreground rounded-lg transition-all active:scale-95"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
